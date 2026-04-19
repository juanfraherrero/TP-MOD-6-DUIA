import { z } from "zod";
import { createLogger } from "@/lib/logger";
import { invokeStructured } from "../shared/llm";
import { tavilySearch } from "../shared/tavily";
import { EXTRACT_CONTEXT_SYSTEM, SYNTHESIZE_SYSTEM } from "./prompts";
import type { AugmentState, AugmentContext, AugmentedFields } from "./state";

const log = createLogger("agent:augment");

// ---------------------------------------------------------------------------
// 1. extract_context — LLM con structured output
// ---------------------------------------------------------------------------
// Dado el título (+ descripción si el admin la puso) deducimos el lugar y el
// tipo de actividad, que luego alimentan la query de Tavily y el prompt de
// síntesis. Defaults tolerantes en todos los campos: el fallback aguanta
// respuestas incompletas del LLM.

const contextSchema = z.object({
  placeName: z
    .string()
    .default("")
    .describe(
      "Nombre del lugar principal (ciudad, sierra, parque, región). Si no hay uno claro, devolvé string vacío.",
    ),
  activityType: z
    .string()
    .default("")
    .describe(
      "Tipo de actividad (trekking, escalada, cabalgata, rafting, kayak, etc.). Si no es claro, devolvé string vacío.",
    ),
  keywords: z
    .array(z.string())
    .default([])
    .describe(
      "3-6 keywords relevantes para buscar contexto en web (ej: 'altitud', 'dificultad', 'clima', 'paisaje').",
    ),
});

export async function extractContext(
  state: AugmentState,
): Promise<Partial<AugmentState>> {
  const end = log.time("extract_context");

  const { title, description } = state.input;

  const user = `Título: ${title}${description?.trim() ? `\nDescripción parcial: ${description}` : ""}

Extraé placeName, activityType y keywords.`;

  const result = await invokeStructured(
    contextSchema,
    [
      ["system", EXTRACT_CONTEXT_SYSTEM],
      ["user", user],
    ],
    { name: "extract_context" },
  );
  end();

  const context: AugmentContext = {
    placeName: result.placeName.trim(),
    activityType: result.activityType.trim(),
    keywords: result.keywords.filter((k) => k.trim().length > 0),
  };

  log.info("context extraído", context);
  return { context };
}

// ---------------------------------------------------------------------------
// 2. web_research — Tavily (degrada grácil si no hay key)
// ---------------------------------------------------------------------------
// La query combina placeName + activityType para obtener info útil (altitud,
// dificultad, clima, paisaje). Si Tavily no tiene key o falla, devolvemos
// contexto vacío — synthesize sigue con los campos que ya hay en el input.

export async function webResearch(
  state: AugmentState,
): Promise<Partial<AugmentState>> {
  const ctx = state.context;
  if (!ctx || (!ctx.placeName && !ctx.activityType)) {
    log.warn("web_research sin contexto útil — skip");
    return { sources: [] };
  }

  const queryParts = [
    ctx.placeName,
    ctx.activityType,
    "turismo aventura: altitud, dificultad, paisaje, clima",
  ].filter((s) => s && s.trim().length > 0);

  const query = queryParts.join(" ");

  log.info("web research", { query: query.slice(0, 120) });

  const result = await tavilySearch(query, {
    maxResults: 3,
    searchDepth: "basic",
  });

  if (!result) {
    log.info("tavily sin resultado — continuo sin webContext");
    return { webContext: undefined, sources: [] };
  }

  const webContext = result.answer.slice(0, 1500);
  return {
    webContext,
    sources: result.sources,
  };
}

// ---------------------------------------------------------------------------
// 3. synthesize — LLM genera los campos aumentados con RAG-aware rewriting
// ---------------------------------------------------------------------------
// Este nodo es el corazón: reescribe `description`, genera `requirements`,
// `physicalPrep` y estima `altitudeM` / `elevationGainM` desde el webContext.
// Instruye explícitamente al LLM a usar vocabulario que se va a indexar por
// embeddings y consumir por el agente cliente — sinónimos naturales, atributos
// implícitos (mar, montaña), términos consistentes con el corpus.

const augmentedSchema = z.object({
  description: z
    .string()
    .default("")
    .describe(
      "Descripción expandida y reescrita para optimizar retrieval vía embeddings semánticos.",
    ),
  requirements: z
    .string()
    .default("")
    .describe("Requisitos (equipo, edad, experiencia, salud)."),
  physicalPrep: z
    .string()
    .default("")
    .describe("Preparación física recomendada."),
  altitudeM: z
    .number()
    .nullish()
    .describe(
      "Altitud máxima en metros. Solo si la info web lo confirma — null en duda.",
    ),
  elevationGainM: z
    .number()
    .nullish()
    .describe(
      "Desnivel acumulado en metros. Solo si la info web lo confirma — null en duda.",
    ),
  ragNotes: z
    .string()
    .default("")
    .describe(
      "1-2 líneas resumiendo qué keywords / vocabulario agregaste para optimizar la búsqueda por embeddings.",
    ),
});

export async function synthesize(
  state: AugmentState,
): Promise<Partial<AugmentState>> {
  const end = log.time("synthesize");

  const { title, description, requirements, physicalPrep } = state.input;
  const ctx = state.context;
  const web = state.webContext;

  const ctxLines = [
    ctx?.placeName ? `- Lugar: ${ctx.placeName}` : null,
    ctx?.activityType ? `- Tipo de actividad: ${ctx.activityType}` : null,
    ctx?.keywords?.length
      ? `- Keywords: ${ctx.keywords.join(", ")}`
      : null,
  ]
    .filter((l): l is string => Boolean(l))
    .join("\n");

  const existingLines = [
    description?.trim() ? `Descripción actual:\n${description}` : null,
    requirements?.trim() ? `Requisitos actuales:\n${requirements}` : null,
    physicalPrep?.trim()
      ? `Preparación física actual:\n${physicalPrep}`
      : null,
  ]
    .filter((l): l is string => Boolean(l))
    .join("\n\n");

  const user = `Título de la actividad: ${title}

${ctxLines || "(sin contexto extraído)"}

${existingLines ? `${existingLines}\n\n` : ""}Contexto de la web (Tavily):
${web ?? "(sin contexto web disponible)"}

Reescribí / expandí los campos siguiendo las reglas. Si algún dato falta en la web, devolvé null (nunca inventes altitudes ni desniveles).`;

  const result = await invokeStructured(
    augmentedSchema,
    [
      ["system", SYNTHESIZE_SYSTEM],
      ["user", user],
    ],
    { name: "synthesize", temperature: 0.2 },
  );
  end();

  const augmented: AugmentedFields = {
    description: result.description ?? "",
    requirements: result.requirements ?? "",
    physicalPrep: result.physicalPrep ?? "",
    altitudeM: result.altitudeM ?? null,
    elevationGainM: result.elevationGainM ?? null,
    ragNotes: result.ragNotes ?? "",
  };

  log.info("synthesize ok", {
    descLen: augmented.description.length,
    hasAltitude: augmented.altitudeM != null,
    hasElevation: augmented.elevationGainM != null,
  });

  return { augmented };
}

// ---------------------------------------------------------------------------
// 4. emit_response — nodo terminal
// ---------------------------------------------------------------------------

export async function emitResponse(
  state: AugmentState,
): Promise<Partial<AugmentState>> {
  log.info("augment completado", {
    hasAugmented: Boolean(state.augmented),
    sources: state.sources.length,
  });
  return {};
}
