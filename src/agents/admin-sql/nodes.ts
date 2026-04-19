import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Parser } from "node-sql-parser";
import { getDataSource } from "@/db/data-source";
import { createLogger } from "@/lib/logger";
import { createLLM, invokeWithRetry } from "../shared/llm";
import {
  generateSqlSystem,
  summarizeErrorPrompt,
  summarizeSuccessPrompt,
} from "./prompts";
import type { AdminSqlState, SqlRow } from "./state";

const log = createLogger("agent:admin-sql");

// ---------------------------------------------------------------------------
// Schema card — cache module-level (se lee una sola vez por process)
// ---------------------------------------------------------------------------
// El documento docs/ANALYTICS_SCHEMA.md fue diseñado para ser el system prompt
// del text-to-SQL agent. Incluye enums, payloads por event_type, reglas SQL
// y 15+ queries de ejemplo NL→SQL que funcionan como few-shots.
//
// Cachear evita leer el disco en cada turno (el archivo es ~15KB).

let schemaCardCache: string | null = null;

function getSchemaCard(): string {
  if (!schemaCardCache) {
    schemaCardCache = readFileSync(
      join(process.cwd(), "docs", "ANALYTICS_SCHEMA.md"),
      "utf-8",
    );
    log.debug("schema card cargado", { chars: schemaCardCache.length });
  }
  return schemaCardCache;
}

// ---------------------------------------------------------------------------
// Constantes de validación
// ---------------------------------------------------------------------------

const TABLE_WHITELIST = new Set([
  "events",
  "activities",
  "conversations",
  "messages",
]);

// Palabras destructivas que jamás deben aparecer fuera de un string literal.
// El parser ya filtra lo primero (solo acepta SELECT), pero chequeamos el
// texto crudo como defensa en profundidad — atrapa casos donde el parser
// podría haber aceptado algo raro (multi-statement, dialectos locos, etc).
const FORBIDDEN_KEYWORDS = [
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "TRUNCATE",
  "INSERT",
  "CREATE",
  "GRANT",
  "COPY",
  "REVOKE",
  "EXECUTE",
];

const MAX_ROWS = 100;

// ---------------------------------------------------------------------------
// 1. generate_sql — LLM con structured output + schema card como contexto
// ---------------------------------------------------------------------------

// Parser manual del markdown que emite qwen-coder (y compatible con cualquier
// modelo que devuelva SQL en code fences). Más robusto que tool calling para
// modelos coder-focused que naturalmente escriben código en markdown.
function parseSqlResponse(content: string): {
  sql: string;
  reasoning: string;
} {
  // 1. Extraer SQL del code fence ```sql ... ``` (o ``` ... ```)
  const fenceMatch = content.match(/```(?:sql|postgresql)?\s*\n?([\s\S]*?)\n?```/i);
  let sql = fenceMatch ? fenceMatch[1].trim() : "";

  // Fallback: si no hay fence, intentamos con "SELECT ..."
  if (!sql) {
    const selectMatch = content.match(/\bSELECT[\s\S]*?(?=\n\s*\n|$)/i);
    sql = selectMatch ? selectMatch[0].trim() : "";
  }

  if (!sql) {
    throw new Error(
      `No se pudo extraer SQL de la respuesta del modelo. Raw: ${content.slice(0, 200)}`,
    );
  }

  // Sacar punto y coma final si lo dejó
  sql = sql.replace(/;\s*$/, "");

  // 2. Extraer reasoning — "REASONING:", "RAZONAMIENTO:", o texto antes/después del fence
  let reasoning = "";
  const reasoningMatch = content.match(
    /(?:REASONING|RAZONAMIENTO|EXPLICACI[ÓO]N)\s*:\s*([\s\S]*?)(?=\n\s*```|$)/i,
  );
  if (reasoningMatch) {
    reasoning = reasoningMatch[1].trim();
  } else if (fenceMatch) {
    // Tomar texto después del fence como reasoning.
    // fenceMatch.index es siempre number (RegExp.exec match result — no es
    // null porque ya chequeamos fenceMatch arriba), pero TS lo tipa como
    // number | undefined. Usamos ?? 0 como fallback defensivo.
    const fenceStart = fenceMatch.index ?? 0;
    const afterFence = content.slice(fenceStart + fenceMatch[0].length).trim();
    if (afterFence.length > 0 && afterFence.length < 500) {
      reasoning = afterFence;
    }
  }

  return { sql, reasoning };
}

export async function generateSql(
  state: AdminSqlState,
): Promise<Partial<AdminSqlState>> {
  const end = log.time("generate_sql");

  const schemaCard = getSchemaCard();
  // Invoke plano — NO withStructuredOutput. Modelos coder (qwen2.5-coder, etc.)
  // prefieren emitir SQL en markdown en vez de tool calls. Parseamos manual.
  const llm = createLLM({ temperature: 0 });

  const recent = state.messages.slice(-3);
  const historyBlock = recent.length
    ? recent
        .map(
          (m) => `${m.role === "user" ? "Admin" : "Asistente"}: ${m.content}`,
        )
        .join("\n")
    : "(sin historial)";

  const question = state.question.trim();

  const systemPrompt = generateSqlSystem(schemaCard);

  const userPrompt = `Historial reciente (puede estar refinando una pregunta previa):
${historyBlock}

Pregunta actual del admin: "${question}"

Generá la query SQL siguiendo el formato indicado.`;

  const raw = await invokeWithRetry(llm, [
    ["system", systemPrompt],
    ["user", userPrompt],
  ]);
  const content =
    typeof raw.content === "string" ? raw.content : JSON.stringify(raw.content);
  const parsed = parseSqlResponse(content);
  end();

  log.info("sql generado", {
    sqlPreview: parsed.sql.slice(0, 120),
    reasoning: parsed.reasoning.slice(0, 120),
  });

  return {
    generatedSql: parsed.sql,
    sqlReasoning: parsed.reasoning,
  };
}

// ---------------------------------------------------------------------------
// 2. validate_sql — parser + whitelist + LIMIT + keywords prohibidas
// ---------------------------------------------------------------------------

function validateSql(
  sql: string,
): { ok: true; sql: string } | { ok: false; reason: string } {
  let trimmed = sql.trim().replace(/;\s*$/, "");

  // Chequeo de keywords destructivas sobre texto crudo (con word boundary,
  // upper-case). Ignoramos contenido dentro de strings literales porque
  // palabras como "INSERT" pueden aparecer legítimamente dentro de un
  // string comparator (ej: WHERE event_type = 'insert_failed'). Las strings
  // literales en SQL están entre comillas simples.
  const sqlWithoutStrings = trimmed.replace(/'(?:''|[^'])*'/g, "''");
  const upper = sqlWithoutStrings.toUpperCase();
  for (const kw of FORBIDDEN_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`);
    if (re.test(upper)) {
      return {
        ok: false,
        reason: `La query contiene la palabra prohibida "${kw}". Solo se permiten SELECT de lectura.`,
      };
    }
  }

  // LIMIT obligatorio. Si falta, lo auto-inyectamos al final (LIMIT 100).
  // Originalmente rechazábamos, pero los modelos locales (qwen3-nothink)
  // fallaban en incluirlo consistentemente incluso con instrucciones explícitas
  // del usuario. Mejor UX: agregar el LIMIT nosotros y dejar pasar la query.
  if (!/\bLIMIT\b/i.test(sqlWithoutStrings)) {
    trimmed = `${trimmed}\nLIMIT 100`;
  }

  // Parse con node-sql-parser en dialecto PostgresQL.
  const parser = new Parser();
  let ast: unknown;
  try {
    ast = parser.astify(trimmed, { database: "PostgresQL" });
  } catch (err) {
    return {
      ok: false,
      reason: `No pude parsear la query SQL: ${String(err)}`,
    };
  }

  // Múltiples statements → rechazar.
  if (Array.isArray(ast)) {
    if (ast.length !== 1) {
      return {
        ok: false,
        reason: "Solo se permite una única sentencia SELECT por turno.",
      };
    }
    ast = ast[0];
  }

  const astObj = ast as { type?: string };
  if (astObj.type !== "select") {
    return {
      ok: false,
      reason: `Solo se permiten sentencias SELECT. Detectado: ${astObj.type ?? "desconocido"}.`,
    };
  }

  // Whitelist de tablas. tableList devuelve strings tipo "select::dbname::events".
  let tables: string[] = [];
  try {
    tables = parser.tableList(trimmed, { database: "PostgresQL" });
  } catch (err) {
    return {
      ok: false,
      reason: `No pude extraer las tablas de la query: ${String(err)}`,
    };
  }

  for (const entry of tables) {
    // Format: "select::<db_or_null>::<table>"
    const parts = entry.split("::");
    const op = parts[0]?.toLowerCase();
    const tableName = parts[parts.length - 1]?.toLowerCase();

    if (op !== "select") {
      return {
        ok: false,
        reason: `Se detectó una operación "${op}" en la query. Solo se permite SELECT.`,
      };
    }
    if (!tableName || !TABLE_WHITELIST.has(tableName)) {
      return {
        ok: false,
        reason: `La tabla "${tableName}" no está permitida. Tablas habilitadas: ${[...TABLE_WHITELIST].join(", ")}.`,
      };
    }
  }

  return { ok: true, sql: trimmed };
}

export async function validateSqlNode(
  state: AdminSqlState,
): Promise<Partial<AdminSqlState>> {
  const sql = state.generatedSql;
  if (!sql) {
    return {
      validationError:
        "El generador no produjo ninguna query SQL — no pude avanzar.",
    };
  }

  const end = log.time("validate_sql");
  const result = validateSql(sql);
  end();

  if (!result.ok) {
    log.warn("sql rechazado por validación", { reason: result.reason });
    return { validationError: result.reason };
  }

  // Si el validator auto-inyectó LIMIT, pisamos generatedSql con la versión
  // corregida para que se ejecute y se muestre al admin exactamente lo que
  // va a correr.
  const finalSql = result.sql;
  if (finalSql !== sql) {
    log.info("sql validado ok (LIMIT auto-inyectado)");
  } else {
    log.info("sql validado ok");
  }
  return { validationError: undefined, generatedSql: finalSql };
}

// ---------------------------------------------------------------------------
// 3. execute_sql — ds.query() raw, con cap adicional de 100 filas
// ---------------------------------------------------------------------------

export async function executeSql(
  state: AdminSqlState,
): Promise<Partial<AdminSqlState>> {
  if (state.validationError) {
    // Este nodo no debería ejecutarse si hay validationError (routing lo evita).
    // Pero por paranoia, si igual se invocara, no tocamos nada.
    return {};
  }

  // generatedSql está definido acá porque el router `routeValidation` solo
  // dirige a este nodo si NO hay validationError, y el validator garantiza
  // que cuando no hay error, generatedSql está seteado con la SQL final.
  const sql = state.generatedSql;
  if (!sql) {
    return {
      validationError:
        "Estado inconsistente: no hay SQL para ejecutar aunque no hubo error de validación.",
    };
  }
  const end = log.time("execute_sql");

  try {
    const ds = await getDataSource();
    const rawRows = (await ds.query(sql)) as SqlRow[];
    const rows = Array.isArray(rawRows) ? rawRows.slice(0, MAX_ROWS) : [];
    end();

    log.info("sql ejecutado ok", {
      rowCount: rows.length,
      truncated: Array.isArray(rawRows) && rawRows.length > MAX_ROWS,
    });

    return { rows, rowCount: rows.length };
  } catch (err) {
    end();
    const msg = err instanceof Error ? err.message : String(err);
    log.error("sql falló en ejecución", { error: msg });
    return {
      validationError: `La query se validó sintácticamente pero falló al ejecutarse: ${msg}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 4. summarize_result — LLM que genera una respuesta natural en español
// ---------------------------------------------------------------------------

export async function summarizeResult(
  state: AdminSqlState,
): Promise<Partial<AdminSqlState>> {
  const end = log.time("summarize_result");

  const llm = createLLM({ temperature: 0 });

  // Caso error: explicamos al admin qué falló y pedimos reformular, sin jerga
  // técnica cruda (aunque sí incluimos la razón de validación porque es útil).
  if (state.validationError) {
    const errorPrompt = summarizeErrorPrompt(
      state.question,
      state.generatedSql,
      state.validationError,
    );

    const raw = await llm.invoke(errorPrompt);
    const text =
      typeof raw.content === "string" ? raw.content : String(raw.content);
    end();

    log.info("summarize_result (error path)", { len: text.length });
    return { response: text };
  }

  // Caso exitoso: resumimos las filas.
  const rows = state.rows ?? [];
  const rowCount = state.rowCount ?? 0;

  // Serialización compacta para el LLM. Truncamos si es muy grande.
  const rowsJson = JSON.stringify(rows, null, 2);
  const rowsForPrompt =
    rowsJson.length > 6000
      ? `${rowsJson.slice(0, 6000)}\n... (truncado)`
      : rowsJson;

  const prompt = summarizeSuccessPrompt(
    state.question,
    state.generatedSql,
    rowCount,
    rowsForPrompt,
  );

  const raw = await llm.invoke(prompt);
  const text =
    typeof raw.content === "string" ? raw.content : String(raw.content);
  end();

  log.info("summarize_result ok", { rowCount, responseLen: text.length });
  return { response: text };
}

// ---------------------------------------------------------------------------
// Conditional router
// ---------------------------------------------------------------------------

export function routeValidation(
  state: AdminSqlState,
): "execute_sql" | "summarize_result" {
  if (state.validationError) {
    log.info("ruta → summarize_result (validation error)");
    return "summarize_result";
  }
  return "execute_sql";
}
