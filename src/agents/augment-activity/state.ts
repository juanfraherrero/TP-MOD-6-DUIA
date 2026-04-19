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

export type AugmentedFields = {
  description: string;
  requirements: string;
  physicalPrep: string;
  altitudeM: number | null;
  elevationGainM: number | null;
  ragNotes: string;
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
  webContext: Annotation<string | undefined>({
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
