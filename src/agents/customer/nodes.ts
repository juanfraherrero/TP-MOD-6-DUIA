import { z } from "zod";
import { createLogger } from "@/lib/logger";
import { retrieveActivities, type RetrieveFilters } from "@/rag";
import { createLLM, invokeStructured } from "../shared/llm";
import { tavilySearch } from "../shared/tavily";
import {
  EVALUATE_MATCH_SYSTEM,
  extractIntentSystem,
  GUARDRAIL_CHECK_SYSTEM,
  INPUT_GUARD_SYSTEM,
  QUERY_REWRITE_SYSTEM,
  RANK_AND_EXPLAIN_SYSTEM,
  TONE_INSTRUCTION,
  fallbackNoMatchPrompt,
} from "./prompts";
import type {
  CustomerState,
  Intent,
  MatchQuality,
  PendingEvent,
} from "./state";

const log = createLogger("agent:customer");

// Umbrales para la clasificación adaptativa del match (ver informe §6.5).
// El router y el ranking se basan en la distribución de relevancias
// individuales, no solo en el promedio — un avg bajo puede ocultar un
// match genuinamente fuerte rodeado de candidatos irrelevantes.
const STRONG_RELEVANCE = 0.7;
const USABLE_RELEVANCE = 0.4;
const ACCEPTABLE_AVG = 0.5;

// Helper — narrows state.intent a no-undefined. Los nodos después de
// extract_intent asumen que intent está seteado; si por algún bug del grafo
// no lo está, preferimos un error explícito antes que un crash críptico.
function requireIntent(state: CustomerState): Intent {
  if (!state.intent) {
    throw new Error(
      "state.intent es undefined — extract_intent debe haber corrido antes.",
    );
  }
  return state.intent;
}

// ---------------------------------------------------------------------------
// 0. input_guard — rechaza queries off-topic antes de gastar el pipeline
// ---------------------------------------------------------------------------
// El output-guard (ver nodo 6) solo evalúa el response final; si el ranking
// devuelve una actividad real del catálogo, la valida como OK aunque el
// input original fuera off-topic. Este nodo cierra esa brecha evaluando
// el mensaje del usuario ANTES de procesarlo.

const inputGuardSchema = z.object({
  // Defaults fail-open: si el modelo omite campos, dejamos pasar al usuario.
  // Ante contenido claramente problemático el modelo igual va a devolver
  // inScope=false explícitamente.
  inScope: z
    .boolean()
    .default(true)
    .describe("true si el mensaje pertenece al dominio turismo aventura."),
  category: z
    .enum([
      "tourism_adventure",
      "greeting",
      "refinement",
      "off_topic_benign",
      "off_topic_harmful",
      "unclear",
    ])
    .default("unclear")
    .describe("Categoría del mensaje."),
  reason: z.string().default("").describe("Una línea explicando."),
});

const OUT_OF_SCOPE_MESSAGE = `Uh, me parece que eso se escapa de lo mío — yo solo te puedo ayudar con actividades de turismo aventura (trekking, escalada, rafting, cabalgatas, ese tipo de onda).

¿Probás con algo de eso? Por ejemplo, decime qué tipo de experiencia tenés ganas de vivir, o si tenés algún lugar en mente.`;

export async function inputGuard(
  state: CustomerState,
): Promise<Partial<CustomerState>> {
  const lastUser =
    [...state.messages].reverse().find((m) => m.role === "user")?.content ??
    "";
  if (!lastUser) return {};

  const end = log.time("input_guard");

  const result = await invokeStructured(
    inputGuardSchema,
    [
      ["system", INPUT_GUARD_SYSTEM],
      ["user", `Mensaje del usuario:\n${lastUser}`],
    ],
    { name: "input_guard" },
  );
  end();

  log.info("input_guard", {
    inScope: result.inScope,
    category: result.category,
    reason: result.reason,
  });

  if (!result.inScope) {
    log.warn("input bloqueado por guardrail", {
      category: result.category,
      reason: result.reason,
    });
    return {
      response: OUT_OF_SCOPE_MESSAGE,
      matchQuality: "none",
      ranked: [],
      pendingEvents: [
        {
          eventType: "guardrail_input_blocked",
          payload: {
            category: result.category,
            reason: result.reason,
            userMessage: lastUser.slice(0, 200),
          },
        },
      ],
    };
  }

  return {};
}

export function routeInputGuard(
  state: CustomerState,
): "extract_intent" | "emit_response" {
  // Si el input_guard setteó un response, cortamos al toque.
  return state.response ? "emit_response" : "extract_intent";
}

// ---------------------------------------------------------------------------
// 1. extract_intent — LLM con structured output
// ---------------------------------------------------------------------------

const intentSchema = z.object({
  semanticQuery: z
    .string()
    .describe(
      "Reescritura corta y descriptiva de la intención, lista para buscar en el catálogo. NO incluir precios ni fechas.",
    ),
  filters: z
    .object({
      maxPriceArs: z
        .number()
        .nullish()
        .describe("Si el usuario menciona un presupuesto máximo en pesos."),
      targetDate: z
        .string()
        .nullish()
        .describe(
          "Fecha ISO YYYY-MM-DD cuando el usuario menciona un día específico (p. ej. 'el sábado 22 de noviembre').",
        ),
      dateRangeStart: z
        .string()
        .nullish()
        .describe(
          "Fecha ISO YYYY-MM-DD de inicio cuando el usuario menciona un rango o semana.",
        ),
      dateRangeEnd: z
        .string()
        .nullish()
        .describe("Fecha ISO YYYY-MM-DD de fin del rango temporal."),
    })
    .default({}),
  placeNames: z
    .array(z.string())
    .default([])
    .describe("Nombres de lugares mencionados (ciudades, sierras, parques)."),
  isOnlyPlace: z
    .boolean()
    .default(false)
    .describe(
      "true si y solo si el mensaje consiste casi exclusivamente en un nombre de lugar sin otras preferencias.",
    ),
});

export async function extractIntent(
  state: CustomerState,
): Promise<Partial<CustomerState>> {
  const end = log.time("extract_intent");

  const recent = state.messages.slice(-6);
  const convo = recent
    .map((m) => `${m.role === "user" ? "Usuario" : "Asesor"}: ${m.content}`)
    .join("\n");

  // Anclaje temporal para que el modelo resuelva expresiones relativas
  // ("próximo sábado", "mañana", "en dos semanas") contra la fecha actual.
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const dayName = [
    "domingo", "lunes", "martes", "miércoles",
    "jueves", "viernes", "sábado",
  ][now.getDay()];

  const intent = (await invokeStructured(
    intentSchema,
    [
      ["system", extractIntentSystem(todayIso, dayName)],
      [
        "user",
        `Historial:\n${convo}\n\nExtraé la intención del último mensaje.`,
      ],
    ],
    { name: "extract_intent" },
  )) as Intent;

  end();
  log.info("intent extraída", {
    semanticQuery: intent.semanticQuery,
    filters: intent.filters,
    placeNames: intent.placeNames,
    isOnlyPlace: intent.isOnlyPlace,
  });

  return { intent };
}

// ---------------------------------------------------------------------------
// 2. web_enrich (proactivo cuando isOnlyPlace)
// ---------------------------------------------------------------------------

export async function webEnrich(
  state: CustomerState,
): Promise<Partial<CustomerState>> {
  const intent = requireIntent(state);
  const places = intent.placeNames.join(", ");
  if (!places) {
    log.warn("webEnrich sin placeNames — skip");
    return {};
  }

  log.info("enrichment proactivo", { places });
  const result = await tavilySearch(
    `${places} turismo aventura: altitud, dificultad, paisaje, clima, actividades recomendadas`,
    { maxResults: 3 },
  );

  if (!result) return {};

  const context = result.answer.slice(0, 1200);
  const merged: Intent = {
    ...intent,
    semanticQuery:
      `${intent.semanticQuery}. Contexto de ${places}: ${context}`.slice(0, 1500),
  };

  return { webContext: context, intent: merged };
}

// ---------------------------------------------------------------------------
// 2.5. query_rewrite — traduce intent a vocabulario técnico del catálogo
// ---------------------------------------------------------------------------
// Camino A de data augmentation (ver docs/INFORME_TP.md): el catálogo se
// enriqueció en la ingesta con audience_tags + descripción técnica. Acá hacemos
// el lado simétrico: reescribimos el query del usuario al mismo vocabulario
// para que el embedding del query y los embeddings de los chunks vivan cerca
// en el espacio vectorial.

const queryRewriteSchema = z.object({
  enrichedQuery: z
    .string()
    .min(5)
    .describe(
      "Reescritura técnica del semanticQuery — frase natural en español, no JSON.",
    ),
  rewriteApplied: z
    .boolean()
    .default(true)
    .describe(
      "false si el query original ya era técnico y no se le agregó nada útil.",
    ),
  reasoning: z
    .string()
    .default("")
    .describe("1-2 líneas explicando qué dimensiones se tradujeron."),
});

export async function queryRewrite(
  state: CustomerState,
): Promise<Partial<CustomerState>> {
  const intent = requireIntent(state);
  const end = log.time("query_rewrite");

  try {
    const result = await invokeStructured(
      queryRewriteSchema,
      [
        ["system", QUERY_REWRITE_SYSTEM],
        [
          "user",
          `semanticQuery a reescribir: "${intent.semanticQuery}"
${state.webContext ? `\nContexto web previo (resumen): ${state.webContext.slice(0, 400)}` : ""}

Devolvé enrichedQuery, rewriteApplied y reasoning.`,
        ],
      ],
      { name: "query_rewrite", temperature: 0.2 },
    );
    end();
    log.info("query reescrito", {
      original: intent.semanticQuery.slice(0, 80),
      enriched: result.enrichedQuery.slice(0, 120),
      rewriteApplied: result.rewriteApplied,
    });
    return {
      enrichedQuery: result.enrichedQuery,
      pendingEvents: [
        {
          eventType: "query_rewritten",
          payload: {
            original: intent.semanticQuery,
            enriched: result.enrichedQuery,
            applied: result.rewriteApplied,
          },
        },
      ],
    };
  } catch (err) {
    end();
    // Fallback: si el LLM falla, seguimos con el semanticQuery original.
    // No bloquear el flujo por un error en un paso de optimización.
    log.warn("query_rewrite falló — sigo con semanticQuery original", {
      error: String(err).slice(0, 200),
    });
    return { enrichedQuery: undefined };
  }
}

// ---------------------------------------------------------------------------
// 3. rag_retrieve — usa el módulo RAG existente
// ---------------------------------------------------------------------------

export async function ragRetrieve(
  state: CustomerState,
): Promise<Partial<CustomerState>> {
  const intent = requireIntent(state);
  const filters: RetrieveFilters = {
    maxPriceArs: intent.filters.maxPriceArs,
    targetDate: intent.filters.targetDate ?? undefined,
    dateRangeStart: intent.filters.dateRangeStart ?? undefined,
    dateRangeEnd: intent.filters.dateRangeEnd ?? undefined,
  };

  // Concatenamos el query original con el reescrito (si existe). Belt &
  // suspenders: el embedding contiene tanto el lenguaje natural del usuario
  // como la traducción técnica, maximizando el recall.
  const queryForRetrieval = state.enrichedQuery
    ? `${intent.semanticQuery}\n${state.enrichedQuery}`
    : intent.semanticQuery;

  // Top-K=6 (antes 8): el LLM evaluator trabaja mejor con menos candidatos
  // y reduce el peso del prompt en evaluate_match → mejor estabilidad de
  // tool calling en Gemini Flash con prompts cargados.
  const candidates = await retrieveActivities(queryForRetrieval, 6, filters);
  return { candidates };
}

// ---------------------------------------------------------------------------
// 4. evaluate_match — CRAG: scorea los candidatos
// ---------------------------------------------------------------------------

const evaluationSchema = z.object({
  evaluations: z
    .array(
      z.object({
        id: z.string().describe("El id exacto del candidato"),
        relevance: z.number().min(0).max(1),
        reason: z.string().default("").describe("1-2 líneas explicando el score"),
      }),
    )
    .default([])
    .describe("Un objeto por cada candidato evaluado."),
});

export async function evaluateMatch(
  state: CustomerState,
): Promise<Partial<CustomerState>> {
  if (state.candidates.length === 0) {
    log.warn("no hay candidatos a evaluar");
    return { evaluation: [], avgScore: 0 };
  }

  const end = log.time("evaluate_match");

  const intent = requireIntent(state);
  // Prompt minimalista para evaluate_match: solo title + descripción corta +
  // precio. Removidos `bestChunk` (era substring de description) y
  // `distance` (ruido para el LLM, ya implícito en el orden de los hits).
  // Bajamos el slice de description 280 → 180 chars.
  const candidatesText = state.candidates
    .map(
      (c) =>
        `[${c.id}] ${c.title}
  ${c.description.slice(0, 180)}
  Precio: $${c.priceArs} ARS`,
    )
    .join("\n\n");

  const prompt = `Evaluá el match de cada candidato contra la intención del usuario.

Intención: ${intent.semanticQuery}
Filtros estructurados: ${JSON.stringify(intent.filters)}

Candidatos:
${candidatesText}

Para cada candidato devolvé relevance 0..1:
- 0.0-0.3: no matchea la intención.
- 0.4-0.6: tiene algo de relación pero no es lo que pidió.
- 0.7-0.9: match fuerte.
- 0.9-1.0: match casi perfecto.`;

  const result = await invokeStructured(
    evaluationSchema,
    [
      ["system", EVALUATE_MATCH_SYSTEM],
      ["user", prompt],
    ],
    { name: "evaluate_match" },
  );
  end();

  const avgScore =
    result.evaluations.length > 0
      ? result.evaluations.reduce((a, e) => a + e.relevance, 0) /
        result.evaluations.length
      : 0;

  log.info("evaluación CRAG", {
    avgScore: Number(avgScore.toFixed(3)),
    topRelevance: Math.max(...result.evaluations.map((e) => e.relevance), 0),
    candidates: result.evaluations.length,
  });

  return { evaluation: result.evaluations, avgScore };
}

// ---------------------------------------------------------------------------
// web_enrich_retry — loop CRAG cuando avgScore es bajo
// ---------------------------------------------------------------------------

export async function webEnrichRetry(
  state: CustomerState,
): Promise<Partial<CustomerState>> {
  const intent = requireIntent(state);
  log.info("CRAG retry — avgScore bajo", { avgScore: state.avgScore });

  const result = await tavilySearch(
    `${intent.semanticQuery} turismo aventura argentina: tipos de actividades, destinos recomendados`,
    { maxResults: 3 },
  );

  if (!result) {
    return { webRetries: state.webRetries + 1 };
  }

  const context = result.answer.slice(0, 1000);
  const enriched: Intent = {
    ...intent,
    semanticQuery:
      `${intent.semanticQuery}. Info adicional: ${context}`.slice(0, 1500),
  };

  return {
    webContext: context,
    intent: enriched,
    webRetries: state.webRetries + 1,
  };
}

// ---------------------------------------------------------------------------
// 5. rank_and_explain — top 3 con pitch conversacional
// ---------------------------------------------------------------------------

const rankSchema = z.object({
  introMessage: z
    .string()
    .default("")
    .describe(
      "Frase de apertura casual, tuteando, ADAPTADA a la calidad del match recibida en el prompt.",
    ),
  proposals: z
    .array(
      z.object({
        id: z.string(),
        pitch: z
          .string()
          .default("")
          .describe("2-3 líneas explicando por qué encaja con el pedido"),
      }),
    )
    .max(3)
    .default([])
    .describe("Una propuesta por cada candidato seleccionado, en ese orden."),
  closingMessage: z
    .string()
    .nullish()
    .describe(
      "Solo cuando matchQuality es 'partial' o 'weak': línea invitando a pedir otras alternativas o afinar la búsqueda.",
    ),
});

export async function rankAndExplain(
  state: CustomerState,
): Promise<Partial<CustomerState>> {
  const end = log.time("rank_and_explain");

  const evals = state.evaluation ?? [];
  const strong = evals
    .filter((e) => e.relevance >= STRONG_RELEVANCE)
    .sort((a, b) => b.relevance - a.relevance);
  const usable = evals
    .filter((e) => e.relevance >= USABLE_RELEVANCE)
    .sort((a, b) => b.relevance - a.relevance);

  // Clasificación determinística de calidad del match
  let matchQuality: MatchQuality;
  let selectedIds: string[];

  if (strong.length >= 2) {
    matchQuality = "strong";
    selectedIds = strong.slice(0, 3).map((e) => e.id);
  } else if (strong.length === 1) {
    matchQuality = "partial";
    selectedIds = [strong[0].id];
  } else if (usable.length > 0) {
    matchQuality = "weak";
    selectedIds = usable.slice(0, 2).map((e) => e.id);
  } else {
    matchQuality = "none";
    selectedIds = [];
  }

  log.info("match quality", {
    matchQuality,
    strong: strong.length,
    usable: usable.length,
    selected: selectedIds.length,
  });

  if (selectedIds.length === 0) {
    // Fallback "none": respuesta LLM-generada, natural, pidiendo más contexto
    // al usuario de forma empática. NO usamos texto hardcodeado para que el
    // tono se adapte al mensaje original del usuario y no suene a bot.
    log.info("fallback no-match — generando pedido de contexto");

    const lastUserMsg =
      [...state.messages].reverse().find((m) => m.role === "user")?.content ??
      "";
    const fallbackLLM = createLLM({ temperature: 0.4 });
    const result = await fallbackLLM.invoke(
      fallbackNoMatchPrompt(lastUserMsg, state.intent?.semanticQuery),
    );
    const text =
      typeof result.content === "string"
        ? result.content
        : String(result.content);

    end();
    return {
      matchQuality,
      ranked: [],
      response: text,
      pendingEvents: [
        {
          eventType: "no_match_generated",
          payload: {
            userMessage: lastUserMsg.slice(0, 200),
            placeNames: state.intent?.placeNames ?? [],
          },
        },
      ],
    };
  }

  let selected = selectedIds
    .map((id) => state.candidates.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  // Recovery A: el evaluator (evaluate_match) puede devolver IDs hallucinados
  // (UUIDs truncados o inventados) que no matchean ningún candidate. Si
  // quedamos sin selected pero teníamos selectedIds, recuperamos tomando los
  // top candidates en el ORDEN del evaluation (mejor score primero).
  // Sin esto, el LLM rank_and_explain recibe un prompt vacío y la UI rompe.
  if (selected.length === 0 && selectedIds.length > 0) {
    log.warn("evaluate_match devolvió IDs no encontrados — recuperando top candidates", {
      selectedIds,
      candidateIds: state.candidates.map((c) => c.id),
    });
    const topByScore = [...evals]
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, selectedIds.length);
    selected = topByScore
      .map((e) => state.candidates.find((c) => c.id === e.id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    // Última red: si NI los IDs del evaluation matchean (todos hallucinados),
    // tomamos los primeros candidates por orden de retrieval.
    if (selected.length === 0) {
      selected = state.candidates.slice(0, selectedIds.length);
      log.warn("evaluation entera no matchea candidates — usando top retrieval", {
        count: selected.length,
      });
    }
  }

  const intent = requireIntent(state);
  const candidatesList = selected
    .map(
      (c, i) =>
        `${i + 1}. [${c.id}] ${c.title}
   ${c.description.slice(0, 250)}
   Precio: $${c.priceArs} ARS | Del ${new Date(c.startDate).toLocaleDateString("es-AR")} al ${new Date(c.endDate).toLocaleDateString("es-AR")}`,
    )
    .join("\n\n");

  const prompt = `El usuario busca: ${intent.semanticQuery}
Filtros estructurados: ${JSON.stringify(intent.filters)}

Calidad del match: **${matchQuality.toUpperCase()}**
Tono a aplicar: ${TONE_INSTRUCTION[matchQuality]}

Actividades seleccionadas:
${candidatesList}`;

  const result = await invokeStructured(
    rankSchema,
    [
      ["system", RANK_AND_EXPLAIN_SYSTEM],
      ["user", prompt],
    ],
    { name: "rank_and_explain", temperature: 0.3 },
  );
  end();

  let ranked = result.proposals
    .map((p, i) => {
      const activity = state.candidates.find((c) => c.id === p.id);
      return activity ? { activity, pitch: p.pitch, rank: i + 1 } : null;
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  // Recovery: el modelo a veces devuelve proposals vacío o con IDs hallucinados
  // (UUIDs que no matchean ningún candidate). Si quedamos sin items pero el
  // sistema YA había seleccionado actividades, reconstruimos con un pitch
  // fallback derivado de la propia descripción para no romper la UI.
  if (ranked.length === 0 && selected.length > 0) {
    log.warn("rank_and_explain devolvió proposals vacío — usando fallback", {
      llmReturned: result.proposals.length,
      selected: selected.length,
    });
    ranked = selected.map((activity, i) => ({
      activity,
      pitch: activity.description.split(". ")[0].slice(0, 220),
      rank: i + 1,
    }));
  }

  // Evento proposal_shown por cada actividad rankeada. La UI se encarga de
  // renderizar los cards y disparar proposal_clicked/conversion desde el front.
  const proposalShownEvents: PendingEvent[] = ranked.map((r) => ({
    eventType: "proposal_shown",
    payload: {
      activityId: r.activity.id,
      rank: r.rank,
      relevance:
        evals.find((e) => e.id === r.activity.id)?.relevance ?? null,
      matchQuality,
    },
  }));

  log.info("ranking listo", { matchQuality, count: ranked.length });

  // response = solo el intro. Los proposals van estructurados en `ranked`
  // (la UI los renderiza como cards). closingMessage va separado para que
  // la UI lo muestre después de los cards.
  return {
    matchQuality,
    ranked,
    response: result.introMessage,
    closingMessage: result.closingMessage ?? undefined,
    pendingEvents: proposalShownEvents,
  };
}

// ---------------------------------------------------------------------------
// 6. guardrail_check — post-procesa la respuesta final, valida scope
// ---------------------------------------------------------------------------
// Ejecuta como última validación antes de emitir al usuario. Si la respuesta
// se fue del tema (programación, política, chistes, otras industrias…) la
// bloquea y la reemplaza por una invitación a volver al dominio de la agencia.
// Defensa contra prompt injection + drift accidental del LLM.

const guardrailSchema = z.object({
  // Defaults: fail-open si el modelo se olvida del field.
  // El guardrail es defensivo; input_guard es la barrera principal.
  inScope: z
    .boolean()
    .default(true)
    .describe("true si la respuesta pertenece al dominio, false si se fue."),
  reason: z
    .string()
    .default("")
    .describe("Una línea explicando la decisión."),
});

export async function guardrailCheck(
  state: CustomerState,
): Promise<Partial<CustomerState>> {
  if (!state.response) return {};

  const end = log.time("guardrail_check");

  const result = await invokeStructured(
    guardrailSchema,
    [
      ["system", GUARDRAIL_CHECK_SYSTEM],
      ["user", `Respuesta a validar:\n\n${state.response}`],
    ],
    { name: "guardrail_check" },
  );
  end();

  log.info("guardrail result", {
    inScope: result.inScope,
    reason: result.reason,
  });

  if (result.inScope) {
    return {}; // pass-through
  }

  log.warn("respuesta bloqueada por guardrail", { reason: result.reason });
  return {
    response: OUT_OF_SCOPE_MESSAGE,
    ranked: [],
    closingMessage: undefined,
    pendingEvents: [
      {
        eventType: "guardrail_output_blocked",
        payload: {
          reason: result.reason,
          matchQualityAtBlock: state.matchQuality,
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 7. emit_response — nodo terminal (puntero para el consumidor del graph)
// ---------------------------------------------------------------------------

export async function emitResponse(
  state: CustomerState,
): Promise<Partial<CustomerState>> {
  log.info("respuesta lista", { len: state.response?.length ?? 0 });
  return {};
}

// ---------------------------------------------------------------------------
// Conditional routers
// ---------------------------------------------------------------------------

export function routeEnrichment(
  state: CustomerState,
): "web_enrich" | "rag_retrieve" {
  return state.intent?.isOnlyPlace ? "web_enrich" : "rag_retrieve";
}

export function routeEvaluation(
  state: CustomerState,
): "web_enrich_retry" | "rank_and_explain" {
  const evals = state.evaluation ?? [];
  const anyStrong = evals.some((e) => e.relevance >= STRONG_RELEVANCE);
  const goodAvg = (state.avgScore ?? 0) >= ACCEPTABLE_AVG;
  const exhausted = state.webRetries >= 1;

  // Basta con UN match fuerte para proceder a ranking. Un avg bajo puede
  // ocultar un match genuinamente bueno rodeado de candidatos irrelevantes.
  if (anyStrong || goodAvg || exhausted) {
    log.info("ruta → rank_and_explain", {
      anyStrong,
      goodAvg,
      exhausted,
      avgScore: state.avgScore,
    });
    return "rank_and_explain";
  }
  log.info("ruta → web_enrich_retry (CRAG)", {
    avgScore: state.avgScore,
    webRetries: state.webRetries,
  });
  return "web_enrich_retry";
}
