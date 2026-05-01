import { z } from "zod";
import { createLogger } from "@/lib/logger";
import {
  listClassifications,
  listDepartments,
} from "@/lib/services/taxonomies";
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
// La query combina placeName + activityType + foco adaptativo según el tipo
// de actividad (no es lo mismo una bodega que un trekking) + keywords del
// extract_context + términos de ubicación para coordenadas. searchDepth
// "advanced" porque es admin-facing y no time-critical. Si Tavily no tiene
// key o falla, devolvemos contexto vacío — synthesize sigue con lo que hay.

// Foco temático por tipo de actividad. Evita el sufijo hardcodeado de
// "altitud, dificultad, paisaje, clima" que sesgaba al estilo trekking
// incluso cuando la actividad era una bodega o un museo. El primer match
// gana; si nada matchea, el default es genérico.
const FOCUS_BY_TYPE: Array<[RegExp, string]> = [
  [
    /bodega|vino|wine|enoturismo|degustaci/i,
    "bodegas, varietales, degustación, gastronomía local",
  ],
  [
    /trekking|escalada|cerro|monta|ascenso|cumbre/i,
    "altitud, dificultad, ruta, equipo, clima, época recomendada",
  ],
  [
    /cabalga|caballo/i,
    "duración, dificultad, equipamiento, paisaje",
  ],
  [
    /museo|hist|cultural|patrimonio/i,
    "historia, exhibiciones, horarios, atracciones cercanas",
  ],
  [
    /astro|estrella|observa/i,
    "cielo nocturno, mejor época, equipamiento, contaminación lumínica",
  ],
  [
    /4x4|todoterreno|aventura/i,
    "ruta, dificultad, vehículo, época, paisaje",
  ],
  [
    /parque|reserva|natural|fauna|aves/i,
    "flora, fauna, recorridos, época, accesos",
  ],
  [
    /rio|cascada|laguna|termas/i,
    "acceso, época, equipamiento, características naturales",
  ],
  [
    /gastronom|comida|restaurante/i,
    "platos típicos, variedades locales, especialidades",
  ],
];

const FOCUS_DEFAULT = "información turística, horarios, accesos, qué visitar";

function buildActivityFocusTerms(activityType: string): string {
  if (!activityType) return FOCUS_DEFAULT;
  for (const [re, terms] of FOCUS_BY_TYPE) {
    if (re.test(activityType)) return terms;
  }
  return FOCUS_DEFAULT;
}

export async function webResearch(
  state: AugmentState,
): Promise<Partial<AugmentState>> {
  const ctx = state.context;
  if (!ctx || (!ctx.placeName && !ctx.activityType)) {
    log.warn("web_research sin contexto útil — skip");
    return { sources: [] };
  }

  const focus = buildActivityFocusTerms(ctx.activityType);
  const keywordsPart = ctx.keywords?.length ? ctx.keywords.join(" ") : "";

  const queryParts = [
    ctx.placeName,
    ctx.activityType,
    keywordsPart,
    focus,
    // Bloque fijo para que Tavily traiga datos de ubicación cuando existan
    // — habilita el sugerido de lat/lng en synthesize.
    "ubicación coordenadas geográficas dirección",
  ].filter((s) => s && s.trim().length > 0);

  const query = queryParts.join(" ");

  log.info("web research", { query: query.slice(0, 160) });

  const result = await tavilySearch(query, {
    maxResults: 3,
    searchDepth: "advanced",
  });

  if (!result) {
    log.info("tavily sin resultado — continuo sin webContext");
    return { webContext: undefined, sources: [] };
  }

  // Cap snippet a 600 chars c/u para no inflar el prompt: con maxResults 3
  // suma ~1800 chars + el answer (1500) = ~3300 chars de contexto web.
  const webContext = {
    answer: result.answer.slice(0, 1500),
    snippets: result.sources.map((s) => ({
      url: s.url,
      title: s.title,
      snippet: s.snippet.slice(0, 600),
    })),
  };

  return {
    webContext,
    sources: result.sources.map((s) => ({ url: s.url, title: s.title })),
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
  suggestedLat: z
    .number()
    .min(-90)
    .max(90)
    .nullish()
    .describe(
      "Latitud sugerida en grados decimales. Solo si los snippets web la confirman explícitamente — null en duda. NO inventes.",
    ),
  suggestedLng: z
    .number()
    .min(-180)
    .max(180)
    .nullish()
    .describe(
      "Longitud sugerida en grados decimales. Solo si los snippets web la confirman explícitamente — null en duda. NO inventes.",
    ),
  ragNotes: z
    .string()
    .default("")
    .describe(
      "1-2 líneas resumiendo qué keywords / vocabulario agregaste para optimizar la búsqueda por embeddings.",
    ),
  suggestedClassificationSlugs: z
    .array(z.string())
    .default([])
    .describe(
      "Slugs de clasificaciones del catálogo que mejor encajan. SOLO slugs que existen en el catálogo provisto en el prompt — no inventes.",
    ),
  suggestedDepartmentSlugs: z
    .array(z.string())
    .default([])
    .describe(
      "Slugs de departamentos del catálogo que mejor encajan. SOLO slugs que existen en el catálogo provisto en el prompt — no inventes.",
    ),
});

export async function synthesize(
  state: AugmentState,
): Promise<Partial<AugmentState>> {
  const end = log.time("synthesize");

  const { title, description, requirements, physicalPrep } = state.input;
  const ctx = state.context;
  const web = state.webContext;

  // Cargamos el catálogo vigente al inicio del nodo. El admin pudo crear una
  // clasificación nueva minutos antes — no cacheamos nada.
  const [classifications, departments] = await Promise.all([
    listClassifications(),
    listDepartments(),
  ]);
  const classificationSlugs = new Set(classifications.map((c) => c.slug));
  const departmentSlugs = new Set(departments.map((d) => d.slug));

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

  const catalogBlock = `CATÁLOGO VIGENTE (sólo podés sugerir slugs que aparezcan acá; NO inventes):

Clasificaciones disponibles (slug → nombre):
${classifications.length > 0 ? classifications.map((c) => `  - ${c.slug} → ${c.name}`).join("\n") : "  (vacío)"}

Departamentos disponibles (slug → nombre):
${departments.length > 0 ? departments.map((d) => `  - ${d.slug} → ${d.name}`).join("\n") : "  (vacío)"}`;

  const webBlock = web
    ? `INFO WEB (resumen + snippets de fuentes):

Resumen:
${web.answer || "(vacío)"}

Fragmentos de fuentes:
${
  web.snippets.length > 0
    ? web.snippets
        .map(
          (s, i) =>
            `${i + 1}. [${s.title || s.url}](${s.url})\n   ${s.snippet || "(sin snippet)"}`,
        )
        .join("\n\n")
    : "(sin snippets)"
}`
    : "(sin contexto web disponible)";

  const user = `Título de la actividad: ${title}

${ctxLines || "(sin contexto extraído)"}

${existingLines ? `${existingLines}\n\n` : ""}${webBlock}

${catalogBlock}

Reescribí / expandí los campos siguiendo las reglas. Si algún dato falta en la web, devolvé null (nunca inventes altitudes, desniveles ni coordenadas).
En suggestedClassificationSlugs y suggestedDepartmentSlugs devolvé SOLO slugs que existan en el catálogo de arriba — entre 0 y 3 de cada uno.`;

  const result = await invokeStructured(
    augmentedSchema,
    [
      ["system", SYNTHESIZE_SYSTEM],
      ["user", user],
    ],
    { name: "synthesize", temperature: 0.2 },
  );
  end();

  // Belt & suspenders: aunque el prompt diga "no inventes", filtramos por las
  // sets que armamos arriba para garantizar que la UI nunca vea slugs fantasma.
  const validClassSlugs = (result.suggestedClassificationSlugs ?? []).filter(
    (s) => classificationSlugs.has(s),
  );
  const validDeptSlugs = (result.suggestedDepartmentSlugs ?? []).filter((s) =>
    departmentSlugs.has(s),
  );

  // Belt & suspenders también para coordenadas: aunque el schema ya
  // restringe el rango, si por alguna razón el LLM devuelve algo fuera de
  // los bounds normales (o un par incompleto), capamos a null.
  const lat = typeof result.suggestedLat === "number" ? result.suggestedLat : null;
  const lng = typeof result.suggestedLng === "number" ? result.suggestedLng : null;
  const validLat = lat != null && lat >= -90 && lat <= 90 ? lat : null;
  const validLng = lng != null && lng >= -180 && lng <= 180 ? lng : null;
  // Solo emitimos el par si AMBOS son válidos — un solo eje no sirve para
  // ubicar nada y la UI no tendría qué hacer con él.
  const suggestedLat = validLat != null && validLng != null ? validLat : null;
  const suggestedLng = validLat != null && validLng != null ? validLng : null;

  const augmented: AugmentedFields = {
    description: result.description ?? "",
    requirements: result.requirements ?? "",
    physicalPrep: result.physicalPrep ?? "",
    altitudeM: result.altitudeM ?? null,
    elevationGainM: result.elevationGainM ?? null,
    suggestedLat,
    suggestedLng,
    ragNotes: result.ragNotes ?? "",
    suggestedClassificationSlugs: validClassSlugs,
    suggestedDepartmentSlugs: validDeptSlugs,
  };

  log.info("synthesize ok", {
    descLen: augmented.description.length,
    hasAltitude: augmented.altitudeM != null,
    hasElevation: augmented.elevationGainM != null,
    hasCoords: suggestedLat != null,
    suggestedClassifications: validClassSlugs.length,
    suggestedDepartments: validDeptSlugs.length,
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
