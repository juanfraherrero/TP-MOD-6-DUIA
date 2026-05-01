import { Annotation } from "@langchain/langgraph";

// Input parcial del formulario — lo mínimo obligatorio es `title`. El resto
// puede venir vacío o con contenido previo (caso edición).
export type AugmentInput = {
  title: string;
  description?: string;
  requirements?: string;
  physicalPrep?: string;
  altitudeM?: number | null;
  elevationGainM?: number | null;
};

export type AugmentContext = {
  placeName: string;
  activityType: string;
  keywords: string[];
};

export type AugmentSource = {
  url: string;
  title: string;
};

// Contexto web pasado a synthesize. Incluye el resumen de Tavily (`answer`)
// más los snippets crudos por fuente — los datos duros (horarios, dirección,
// coordenadas) suelen estar en los snippets, no en el resumen sintetizado.
export type AugmentWebContext = {
  answer: string;
  snippets: Array<{ url: string; title: string; snippet: string }>;
};

export type AugmentedFields = {
  description: string;
  requirements: string;
  physicalPrep: string;
  altitudeM: number | null;
  elevationGainM: number | null;
  // Coordenadas sugeridas. Solo se completan si los snippets web las
  // confirman explícitamente — el LLM tiene instrucciones de NO inventar.
  // null = sin sugerencia, el form del admin queda como estaba.
  suggestedLat: number | null;
  suggestedLng: number | null;
  ragNotes: string;
  // Sugerencias de catálogo (Fase 5). Slugs que el LLM eligió de las listas
  // existentes en DB. La UI las muestra como chips clickeables que el admin
  // puede aceptar/descartar antes de "Aplicar".
  suggestedClassificationSlugs: string[];
  suggestedDepartmentSlugs: string[];
};

// Canal de eventos — el módulo no emite analytics propios, pero mantenemos
// el channel por consistencia con customer/state.ts y admin-sql/state.ts.
export type PendingEvent = {
  eventType: string;
  payload: Record<string, unknown>;
};

export const AugmentAnnotation = Annotation.Root({
  input: Annotation<AugmentInput>({
    reducer: (_, update) => update,
    default: () => ({ title: "" }),
  }),
  context: Annotation<AugmentContext | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  webContext: Annotation<AugmentWebContext | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  sources: Annotation<AugmentSource[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),
  augmented: Annotation<AugmentedFields | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  pendingEvents: Annotation<PendingEvent[]>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),
});

export type AugmentState = typeof AugmentAnnotation.State;
