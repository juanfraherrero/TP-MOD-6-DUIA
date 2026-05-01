import { Annotation } from "@langchain/langgraph";
import type { ActivityHit } from "@/rag";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// Contexto web pasado entre nodos cuando el loop CRAG dispara web_enrich_retry.
// Mismo shape que el augment usa (AugmentWebContext): el resumen sintetizado
// + los snippets crudos por fuente, porque los snippets suelen aportar señal
// concreta (lugares, datos duros, nombres propios) que el resumen pierde.
export type WebContext = {
  answer: string;
  snippets: Array<{ url: string; title: string; snippet: string }>;
};

export type Intent = {
  semanticQuery: string;
  filters: {
    maxPriceArs?: number;
    // Fecha exacta ISO "YYYY-MM-DD" cuando el usuario menciona un día concreto.
    targetDate?: string;
    // Rango cuando menciona una semana / un intervalo.
    dateRangeStart?: string;
    dateRangeEnd?: string;
    // Constraints numéricos de altitud/desnivel. Solo cuando el usuario
    // menciona números explícitos ("sobre 4000m", "menos de 800m de desnivel").
    // Frases cualitativas ("alta montaña", "exigente") NO van acá — el
    // matching cualitativo lo resuelve el embedding contra audienceTags.
    minAltitudeM?: number;
    maxAltitudeM?: number;
    minElevationGainM?: number;
    maxElevationGainM?: number;
  };
  placeNames: string[];
  isOnlyPlace: boolean;
  // Señales de catálogo (Fase 5). NO son filtros: query_rewrite las suma al
  // enrichedQuery para que el embedding pondere lo que el usuario pidió.
  mentionedPlaces: string[];
  mentionedCategories: string[];
};

export type EvaluationItem = {
  id: string;
  relevance: number;
  reason: string;
};

export type RankedProposal = {
  activity: ActivityHit;
  pitch: string;
  rank: number;
};

// Evento que un nodo quiere persistir al final del turno. Se acumulan en el
// state y la API route los graba en batch después de que el grafo completa.
export type PendingEvent = {
  eventType: string;
  payload: Record<string, unknown>;
};

export const CustomerAnnotation = Annotation.Root({
  messages: Annotation<ChatMessage[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),
  intent: Annotation<Intent | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  webContext: Annotation<WebContext | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  // Reescritura técnica del semanticQuery — la genera query_rewrite usando
  // vocabulario alineado con el catálogo (dificultad, altitud, perfil del
  // público). Si no se generó, rag_retrieve cae al semanticQuery original.
  enrichedQuery: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  candidates: Annotation<ActivityHit[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),
  evaluation: Annotation<EvaluationItem[] | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  avgScore: Annotation<number | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  webRetries: Annotation<number>({
    reducer: (curr, update) => update ?? curr,
    default: () => 0,
  }),
  matchQuality: Annotation<
    "strong" | "partial" | "weak" | "none" | undefined
  >({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  ranked: Annotation<RankedProposal[] | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  response: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  closingMessage: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  pendingEvents: Annotation<PendingEvent[]>({
    // Concatenamos eventos pendientes para persistir al final del turno.
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),
});

export type MatchQuality = "strong" | "partial" | "weak" | "none";

export type CustomerState = typeof CustomerAnnotation.State;
