import { Annotation } from "@langchain/langgraph";
import type { ActivityHit } from "@/rag";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
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
  };
  placeNames: string[];
  isOnlyPlace: boolean;
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
  webContext: Annotation<string | undefined>({
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
