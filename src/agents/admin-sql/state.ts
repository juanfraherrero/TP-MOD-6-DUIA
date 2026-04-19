import { Annotation } from "@langchain/langgraph";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// Fila genérica devuelta por ds.query(). Usamos Record<string, unknown>
// porque el admin puede generar SELECTs arbitrarios sobre el schema.
export type SqlRow = Record<string, unknown>;

// Evento opcional — el Módulo D NO trackea al admin como usuario end
// (es el operador del sistema). Se deja el channel por paralelismo con
// customer/state.ts por si se quiere loguear algo (ej: queries ejecutadas).
export type PendingEvent = {
  eventType: string;
  payload: Record<string, unknown>;
};

export const AdminSqlAnnotation = Annotation.Root({
  messages: Annotation<ChatMessage[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),
  question: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  generatedSql: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  sqlReasoning: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  validationError: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  rows: Annotation<SqlRow[] | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  rowCount: Annotation<number | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  response: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  pendingEvents: Annotation<PendingEvent[]>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),
});

export type AdminSqlState = typeof AdminSqlAnnotation.State;
