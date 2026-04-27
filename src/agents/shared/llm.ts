import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/ollama";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { createLogger } from "@/lib/logger";

// Punto único de swap del LLM provider. Se selecciona por env var
// LLM_PROVIDER (groq | gemini | ollama). Todos los nodos del grafo usan
// createLLM(), así que cambiar de proveedor es un restart de `npm run dev`.
//
// Historia: durante el testing Groq nos baneó la cuenta sin previo aviso
// (organization_restricted). El swap a Gemini tomó 5 minutos porque toda
// la instanciación del LLM estaba concentrada acá desde el día 1. Ollama
// se agregó como tercera capa de fallback local para cuando se agotan
// los free tiers cloud — corre offline contra un servidor local.

const log = createLogger("agent:llm");

type Provider = "groq" | "gemini" | "ollama";

type LLMOptions = {
  temperature?: number;
  maxTokens?: number;
  model?: string;
};

function getProvider(): Provider {
  const raw = (process.env.LLM_PROVIDER ?? "gemini").toLowerCase();
  if (raw !== "groq" && raw !== "gemini" && raw !== "ollama") {
    throw new Error(
      `LLM_PROVIDER inválido: "${raw}". Valores permitidos: "groq" | "gemini" | "ollama".`,
    );
  }
  return raw;
}

function getActiveModel(p: Provider): string {
  if (p === "gemini") {
    return process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  }
  if (p === "groq") {
    return process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
  }
  // ollama
  return process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct";
}

// Log una sola vez en el boot — evita spam en HMR.
const globalForLLM = globalThis as unknown as { __llmLogged?: boolean };
if (!globalForLLM.__llmLogged) {
  try {
    const p = getProvider();
    const model = getActiveModel(p);
    log.info(`LLM provider activo: ${p} (${model})`);
  } catch (err) {
    log.warn("LLM provider mal configurado", { error: String(err) });
  }
  globalForLLM.__llmLogged = true;
}

/**
 * Invoca el LLM pidiendo structured output, con fallback automático a JSON
 * parsing manual cuando el modelo (típicamente coder models locales como
 * qwen2.5-coder) no emite tool calls y responde con JSON en markdown fences.
 *
 * Path 1: withStructuredOutput (Gemini, Groq, modelos con tool calling sólido)
 * Path 2: plain invoke + parse JSON del markdown response (Ollama coder)
 *
 * Uso típico en nodos del grafo:
 *   const result = await invokeStructured(
 *     mySchema,
 *     [["system", sys], ["user", usr]],
 *     { name: "my_node" },
 *   );
 */
export async function invokeStructured<T extends z.ZodTypeAny>(
  schema: T,
  messages: Array<[string, string]>,
  options: { name: string; temperature?: number },
): Promise<z.infer<T>> {
  const base = createLLM({ temperature: options.temperature ?? 0 });

  // Hint explícito al system prompt pidiendo que use el tool call.
  // Ayuda a modelos que entienden tool calling pero tienden a ignorarlo
  // (coder models que prefieren escribir código/JSON en markdown).
  // `/no_think` desactiva el thinking mode de Qwen3 (evita verborrea previa).
  // Modelos que no lo reconocen lo ignoran silenciosamente.
  const toolHint = `\n\nIMPORTANTE: tenés disponible una tool llamada "${options.name}" con un schema de parámetros específico. DEBÉS invocar esa tool como respuesta — no respondas con texto plano, ni con markdown, ni con bloques de código. Usá el tool call.\n\n/no_think`;

  const messagesWithHint: Array<[string, string]> = messages.map((m, i) => {
    if (i === 0 && m[0] === "system") {
      return [m[0], m[1] + toolHint] as [string, string];
    }
    return m;
  });

  // Path 1: structured output vía tool calling (funciona en Gemini/Groq y
  // con el hint arriba puede funcionar también en coder models).
  try {
    const structured = base.withStructuredOutput(schema, {
      name: options.name,
    });
    const raw = await invokeWithRetry(structured, messagesWithHint);
    return schema.parse(raw);
  } catch (err) {
    const msg = String(err);
    const isToolCallFailure =
      msg.includes("No tool calls found") ||
      msg.includes("tool_call") ||
      msg.includes("Failed to parse");
    if (!isToolCallFailure) throw err;
    log.warn("invokeStructured: fallback a JSON manual", {
      name: options.name,
      error: msg.slice(0, 120),
    });
  }

  // Path 2: plain invoke + parse JSON del markdown (qwen-coder y cía.)
  // Incluimos el JSON Schema en el prompt para que el modelo conozca la
  // estructura EXACTA que esperamos — si no, inventa formatos propios.
  const schemaJson = JSON.stringify(zodToJsonSchema(schema), null, 2);
  const enrichedMessages: Array<[string, string]> = messages.map((m, i) => {
    if (i === 0 && m[0] === "system") {
      return [
        m[0],
        `${m[1]}\n\nIMPORTANTE — formato de respuesta estricto:
- Respondé ÚNICAMENTE con un objeto JSON válido entre \`\`\`json fences.
- El JSON debe matchear EXACTAMENTE este schema (nombres de campos, tipos, estructura):

\`\`\`json
${schemaJson}
\`\`\`

- NO inventes campos distintos a los del schema.
- NO agregues texto antes ni después del \`\`\`json fence.

/no_think`,
      ] as [string, string];
    }
    return m;
  });

  const rawMsg = await base.invoke(enrichedMessages);
  const rawContent =
    typeof rawMsg.content === "string"
      ? rawMsg.content
      : String(rawMsg.content);

  // Qwen3 (y otros thinking models) emiten <think>...</think> antes de la
  // respuesta real aunque pidamos /no_think. Los stripeamos antes de parsear.
  const content = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  const fenceMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : content.trim();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonStr);
  } catch {
    throw new Error(
      `No pude parsear JSON en invokeStructured(${options.name}). Raw: ${content.slice(0, 300)}`,
    );
  }

  return schema.parse(parsedJson);
}

/**
 * Invoca una LLM runnable con retry sobre errores transitorios de tool calling
 * (típicos en modelos locales chicos: "No tool calls found in the response").
 * Re-lanza inmediatamente si el error no matchea el patrón conocido.
 */
export async function invokeWithRetry<TInput, TOutput>(
  runnable: { invoke: (input: TInput) => Promise<TOutput> },
  input: TInput,
  maxRetries = 2,
): Promise<TOutput> {
  let lastError: unknown;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await runnable.invoke(input);
    } catch (err) {
      lastError = err;
      const msg = String(err);
      const isRetryable =
        msg.includes("No tool calls found") ||
        msg.includes("tool_call") ||
        msg.includes("Failed to parse");
      if (!isRetryable) throw err;
      log.warn(`invokeWithRetry: retry ${i + 1}/${maxRetries}`, {
        error: msg.slice(0, 120),
      });
    }
  }

  // Todos los retries fallaron — capturamos el raw output del modelo
  // llamándolo SIN structured output, para debuggear por qué no emitió
  // el tool call. Esto es información diagnóstica; el error original se relanza.
  try {
    const debugLLM = createLLM({ temperature: 0 });
    const debugResult = await debugLLM.invoke(
      input as Parameters<typeof debugLLM.invoke>[0],
    );
    const content =
      typeof debugResult.content === "string"
        ? debugResult.content
        : JSON.stringify(debugResult.content);
    log.error("raw LLM output (sin structured) cuando falló tool calling", {
      rawContent: content.slice(0, 800),
    });
  } catch (debugErr) {
    log.error("no pude capturar raw output para debug", {
      error: String(debugErr).slice(0, 200),
    });
  }

  throw lastError;
}

// ───────── observability wrapper para providers cloud ─────────────────────
// Envoltorio Proxy aplicado a Gemini y Groq (no a Ollama). Hace 2 cosas:
//   1) Timeout explícito sobre cada `invoke()` — sin esto, un cuelgue del
//      provider (ej: Gemini con quota agotada que retiene la conexión)
//      bloquea el grafo entero sin error visible.
//   2) Captura de errores de la API y log estructurado con status HTTP,
//      retryDelay y quotaId si los hay (Gemini exporta esto en el body).
// El error se re-lanza tal cual; la lógica upstream (invokeWithRetry,
// route handler) sigue manejándolo igual que antes.

const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 60_000);

type ParsedProviderError = {
  status?: number;
  retryDelaySec?: number;
  quotaId?: string;
  reason: string;
};

function parseProviderError(
  provider: Provider,
  err: unknown,
): ParsedProviderError {
  const raw = err instanceof Error ? err.message : String(err);

  if (provider === "gemini") {
    // Formato típico del SDK de Google:
    // "[GoogleGenerativeAI Error]: Error fetching from <url>: [400 Bad Request] <reason>"
    // Con body JSON anexo cuando es 429: contiene retryDelay y quotaId.
    const statusMatch = raw.match(/\[(\d{3})\s/);
    const status = statusMatch ? Number(statusMatch[1]) : undefined;
    const retryMatch = raw.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
    const retryDelaySec = retryMatch ? Number(retryMatch[1]) : undefined;
    const quotaMatch = raw.match(/"quotaId"\s*:\s*"([^"]+)"/);
    const quotaId = quotaMatch ? quotaMatch[1] : undefined;
    return { status, retryDelaySec, quotaId, reason: raw };
  }

  if (provider === "groq") {
    const statusMatch =
      raw.match(/status[\s:=]+(\d{3})/i) || raw.match(/\[(\d{3})/);
    return {
      status: statusMatch ? Number(statusMatch[1]) : undefined,
      reason: raw,
    };
  }

  return { reason: raw };
}

type AnyInvokable = { invoke: (...args: unknown[]) => Promise<unknown> };

function wrapInvoke(provider: Provider, target: AnyInvokable, args: unknown[]) {
  const start = performance.now();
  return Promise.race([
    target.invoke(...args),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `LLM_TIMEOUT: ${LLM_TIMEOUT_MS}ms sin respuesta del provider ${provider}`,
            ),
          ),
        LLM_TIMEOUT_MS,
      ),
    ),
  ]).catch((err: unknown) => {
    const ms = Math.round(performance.now() - start);
    const isTimeout =
      err instanceof Error && err.message.startsWith("LLM_TIMEOUT");
    const parsed = parseProviderError(provider, err);

    // Solo logueamos errores que parecen reales de la API (status detectado
    // o timeout). Errores de parsing de tool calling vienen sin status y se
    // manejan en invokeWithRetry/invokeStructured con su propio log.
    if (parsed.status !== undefined || isTimeout) {
      log.error(`API error (${provider})`, {
        ms,
        status: parsed.status,
        timeout: isTimeout,
        retryDelaySec: parsed.retryDelaySec,
        quotaId: parsed.quotaId,
        reason: parsed.reason.slice(0, 400),
      });
    }
    throw err;
  });
}

// Sanitiza JSON Schema para Gemini, que NO acepta el dialecto JSON Schema
// estándar — usa OpenAPI 3.0 Proto (subset). Diferencias clave:
//   - JSON Schema usa  {"type": ["string", "null"]}  para campos nullable.
//   - OpenAPI 3.0 usa  {"type": "string", "nullable": true}.
// Aplica recursivo, in-place sobre objects/arrays. Solo lo usa el wrapper
// de Gemini — el output se pasa directo a withStructuredOutput como JSON
// Schema crudo, evitando que LangChain re-traduzca el Zod.
function sanitizeSchemaForGemini(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeSchemaForGemini);
  if (node === null || typeof node !== "object") return node;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    // Strip de keys que Gemini rechaza explícitamente (no son parte de su
    // subset OpenAPI 3.0 Proto). additionalProperties es la trampa más común
    // — zodToJsonSchema la pone en true/false en cualquier z.object().
    if (
      k === "$schema" ||
      k === "$ref" ||
      k === "$id" ||
      k === "definitions" ||
      k === "additionalProperties" ||
      k === "patternProperties" ||
      k === "unevaluatedProperties" ||
      k === "dependencies" ||
      k === "propertyNames" ||
      k === "contains" ||
      k === "not" ||
      k === "if" ||
      k === "then" ||
      k === "else"
    ) {
      continue;
    }

    if (k === "type" && Array.isArray(v)) {
      const types = (v as string[]).filter((t) => t !== "null");
      const hasNull = (v as string[]).includes("null");
      // Gemini espera type: scalar. Colapsamos al primer no-null y movemos
      // el null a `nullable: true`.
      out.type = types[0] ?? "string";
      if (hasNull) out.nullable = true;
      continue;
    }
    out[k] = sanitizeSchemaForGemini(v);
  }
  return out;
}

function isZodSchema(x: unknown): x is z.ZodTypeAny {
  return Boolean(
    x && typeof x === "object" && "_def" in (x as Record<string, unknown>),
  );
}

function wrapWithObservability(
  model: BaseChatModel,
  provider: Provider,
): BaseChatModel {
  return new Proxy(model, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== "function") return original;

      // Caso 1: invoke directo del modelo.
      if (prop === "invoke") {
        return (...args: unknown[]) =>
          wrapInvoke(provider, target as unknown as AnyInvokable, args);
      }

      // Caso 2: withStructuredOutput devuelve un nuevo Runnable. Necesitamos
      // envolverlo también para interceptar SU `invoke()` — la llamada a la
      // API ocurre cuando ese runnable se ejecuta, no cuando se construye.
      // Para Gemini además convertimos el Zod a JSON Schema sanitizado ANTES
      // de pasárselo al SDK, para esquivar el error 400 "Proto field is not
      // repeating, cannot start list" en campos `.nullish()`/`.nullable()`.
      if (prop === "withStructuredOutput") {
        return (...args: unknown[]) => {
          const callArgs =
            provider === "gemini" && isZodSchema(args[0])
              ? [
                  sanitizeSchemaForGemini(
                    zodToJsonSchema(args[0] as z.ZodTypeAny),
                  ),
                  ...args.slice(1),
                ]
              : args;

          const runnable = (
            original as (...a: unknown[]) => unknown
          ).apply(target, callArgs) as object;

          return new Proxy(runnable, {
            get(rt, rp, rr) {
              const ro = Reflect.get(rt, rp, rr);
              if (rp === "invoke" && typeof ro === "function") {
                return (...a: unknown[]) =>
                  wrapInvoke(provider, rt as unknown as AnyInvokable, a);
              }
              if (typeof ro === "function") return ro.bind(rt);
              return ro;
            },
          });
        };
      }

      return original.bind(target);
    },
  }) as BaseChatModel;
}

// ───────── factories por provider ───────────────────────────────────────────
// Gemini y Groq atraviesan wrapWithObservability. Ollama queda en el path
// directo: corre local, los errores son de red/modelo y los maneja el cliente.

function createGeminiLLM(options: LLMOptions): BaseChatModel {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_API_KEY no está definido. Sacá una key gratis en https://aistudio.google.com y ponela en .env.",
    );
  }
  const base = new ChatGoogleGenerativeAI({
    apiKey,
    model: options.model ?? process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    temperature: options.temperature ?? 0.2,
    maxOutputTokens: options.maxTokens,
  });
  return wrapWithObservability(base, "gemini");
}

function createGroqLLM(options: LLMOptions): BaseChatModel {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY no está definido. Copiá .env.example a .env y completalo.",
    );
  }
  const base = new ChatGroq({
    apiKey,
    model:
      options.model ?? process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
    temperature: options.temperature ?? 0.2,
    maxTokens: options.maxTokens,
  });
  return wrapWithObservability(base, "groq");
}

function createOllamaLLM(options: LLMOptions): BaseChatModel {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  return new ChatOllama({
    baseUrl,
    model: options.model ?? process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct",
    temperature: options.temperature ?? 0.2,
    numPredict: options.maxTokens,
  });
}

export function createLLM(options: LLMOptions = {}): BaseChatModel {
  const provider = getProvider();
  if (provider === "gemini") return createGeminiLLM(options);
  if (provider === "groq") return createGroqLLM(options);
  return createOllamaLLM(options);
}
