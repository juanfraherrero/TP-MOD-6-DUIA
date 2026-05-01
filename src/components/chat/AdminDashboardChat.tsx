"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import { AIBadge } from "@/components/ui/AIBadge";
import { PhaseDot } from "@/components/ui/PhaseDot";
import { ChatErrorBanner } from "@/components/ui/ChatErrorBanner";

// Nota: el agente sigue generando y validando SQL en el backend (queda en logs
// del server). Solo no lo exponemos en la UI: para un admin el detalle de la
// query no aporta — interesa el resultado en lenguaje natural.
type Msg = {
  role: "user" | "assistant";
  content: string;
  validationError?: string;
  rowCount?: number;
};

const PHASE_LABELS: Record<string, string> = {
  generate_sql: "Interpretando tu pregunta",
  validate_sql: "Verificando la consulta",
  execute_sql: "Buscando en los datos",
  summarize_result: "Armando el resumen",
};

const SUGGESTIONS = [
  "¿Cuántos usuarios únicos hubo hoy?",
  "¿Qué actividad se clickea más esta semana?",
  "Distribución de match quality en los últimos 7 días",
  "Conversiones por dispositivo",
];

export function AdminDashboardChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<string | null>(null);
  const [phaseLog, setPhaseLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase, phaseLog, hasError]);

  // Núcleo del request — recibe los mensajes a mandar y maneja el SSE.
  async function callApi(messagesToSend: Msg[]) {
    setLoading(true);
    setPhase(null);
    setPhaseLog([]);
    setHasError(false);

    try {
      const res = await fetch("/api/chat/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messagesToSend.map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResponse: string | undefined;
      let finalValidationError: string | undefined;
      let finalRowCount: number | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const raw of events) {
          if (!raw.trim()) continue;
          const lines = raw.split("\n");
          let evt = "";
          let data: unknown = null;
          for (const line of lines) {
            if (line.startsWith("event: ")) evt = line.slice(7);
            else if (line.startsWith("data: ")) {
              data = JSON.parse(line.slice(6));
            }
          }

          if (evt === "node") {
            const d = data as {
              node: string;
              state: {
                response?: string;
                validationError?: string;
                rowCount?: number;
              };
            };
            setPhase(d.node);
            setPhaseLog((prev) => [...prev, d.node]);
            if (d.state?.response) finalResponse = d.state.response;
            if (d.state?.validationError !== undefined) {
              finalValidationError = d.state.validationError || undefined;
            }
            if (typeof d.state?.rowCount === "number") {
              finalRowCount = d.state.rowCount;
            }
          } else if (evt === "done") {
            const d = data as {
              response?: string;
              validationError?: string;
              rowCount?: number;
            };
            finalResponse = d.response ?? finalResponse;
            finalValidationError = d.validationError ?? finalValidationError;
            finalRowCount =
              typeof d.rowCount === "number" ? d.rowCount : finalRowCount;
          } else if (evt === "error") {
            const d = data as { message: string };
            throw new Error(d.message);
          }
        }
      }

      setMessages([
        ...messagesToSend,
        {
          role: "assistant",
          content: finalResponse ?? "No pude generar una respuesta.",
          validationError: finalValidationError,
          rowCount: finalRowCount,
        },
      ]);
    } catch (err) {
      // El error técnico se loguea acá, no se muestra al usuario.
      console.error("[admin-chat] request failed:", err);
      setHasError(true);
    } finally {
      setLoading(false);
      setPhase(null);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const newMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    callApi(newMessages);
  }

  function retry() {
    if (loading) return;
    callApi(messages);
  }

  function pickSuggestion(s: string) {
    if (loading) return;
    setInput(s);
  }

  return (
    <div className="flex flex-col w-full max-w-6xl mx-auto h-[calc(100vh-72px-64px-2px)] sm:h-[calc(100vh-72px-96px-2px)] bg-surface-secondary border border-soft rounded-2xl overflow-hidden shadow-sm">
      <header className="px-6 sm:px-8 py-6 border-b border-soft bg-surface-tertiary/40">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="text-eyebrow uppercase text-text-tertiary">
              Analíticas · Lenguaje natural
            </span>
            <h1 className="mt-2 text-h3 text-text-primary">
              Panel de Analíticas
            </h1>
            <p className="mt-2 text-body text-text-secondary max-w-2xl">
              Preguntá sobre los datos del producto y el Agente arma una
              respuesta a partir de tus consultas.
            </p>
          </div>
          <EventCatalogHint />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-4 pt-2">
            <p className="text-eyebrow uppercase text-text-tertiary">
              Ejemplos de consultas
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => pickSuggestion(s)}
                  className="focus-glow h-9 px-4 rounded-full border border-medium bg-surface-primary text-btn text-text-secondary hover:border-brand-primary/40 hover:text-brand-primary hover:bg-brand-primary/[0.04] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}

        {loading && (
          <div className="space-y-3 pl-1 animate-fade-in">
            {phaseLog.map((p, i) => {
              const isLast = i === phaseLog.length - 1;
              return (
                <div key={i} className="flex items-center gap-3 text-btn">
                  <PhaseDot active={isLast} />
                  <span
                    className={
                      isLast ? "text-text-primary" : "text-text-tertiary"
                    }
                  >
                    {PHASE_LABELS[p] ?? p}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {hasError && !loading && <ChatErrorBanner onRetry={retry} />}

        <div ref={scrollRef} />
      </div>

      <form
        onSubmit={send}
        className="border-t border-soft px-4 sm:px-6 py-3 sm:py-4 flex gap-2 bg-surface-tertiary/30"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder='ej: "¿cuántos usuarios únicos hubo hoy?"'
          className="input flex-1"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="btn-primary-cta"
        >
          Consultar
        </button>
      </form>
    </div>
  );
}

// Popover inline que explica los tipos de evento que el sistema registra,
// para que el admin sepa sobre qué puede preguntar al Agente.
// CSS-only via `group-hover` + `group-focus-within` — sin state, sin JS extra.
function EventCatalogHint() {
  return (
    <div className="relative inline-block group shrink-0 self-start">
      <button
        type="button"
        className="
          inline-flex items-center gap-1.5
          h-9 px-3 rounded-md
          border border-brand-primary/20 bg-brand-primary/[0.04]
          text-link text-brand-primary
          hover:bg-brand-primary/10 hover:border-brand-primary/40
          focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30
          transition-colors
        "
        aria-label="Saber más sobre los eventos disponibles"
      >
        <InfoIcon />
        <span>Saber más</span>
      </button>
      <div
        role="dialog"
        className="
          invisible opacity-0
          group-hover:visible group-hover:opacity-100
          group-focus-within:visible group-focus-within:opacity-100
          absolute z-50 right-0 top-full mt-2
          w-[min(420px,calc(100vw-32px))]
          rounded-2xl border border-soft bg-surface-secondary shadow-l2
          p-5
          transition-opacity duration-150
        "
      >
        <div className="text-eyebrow uppercase text-text-tertiary">
          Eventos que registra el sistema
        </div>
        <dl className="mt-3 space-y-3">
          <EventItem
            name="page_view"
            description="Cada vez que un visitante carga una página del sitio. Sirve para medir tráfico y tasa de rebote."
          />
          <EventItem
            name="chat_message_sent"
            description="El visitante le envía una pregunta al Agente de Turismo. Sirve para medir interés y profundidad de conversación."
          />
          <EventItem
            name="proposal_clicked"
            description="El visitante hace click sobre una actividad sugerida. Indica qué propuestas captan atención."
          />
          <EventItem
            name="conversion"
            description='El visitante aprieta "Me interesa" en una propuesta. Es el éxito del embudo.'
          />
        </dl>
        <div className="mt-4 pt-4 border-t border-soft">
          <div className="text-eyebrow uppercase text-text-tertiary">
            Ejemplos de preguntas
          </div>
          <ul className="mt-2 space-y-1.5 text-btn text-text-secondary list-disc list-inside marker:text-brand-primary">
            <li>¿Cuántas conversiones hubo esta semana?</li>
            <li>¿Cuál es la actividad con más clicks?</li>
            <li>¿Qué porcentaje de mensajes terminan en conversión?</li>
            <li>Page views por día en los últimos 7 días</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function EventItem({
  name,
  description,
}: {
  name: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt>
        <code className="font-mono text-code-sm bg-brand-primary/10 text-brand-primary border border-brand-primary/20 rounded px-1.5 py-0.5">
          {name}
        </code>
      </dt>
      <dd className="text-btn text-text-secondary leading-snug">
        {description}
      </dd>
    </div>
  );
}

function InfoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function MessageBubble({ message }: { message: Msg }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg px-4 py-3 text-body whitespace-pre-wrap leading-relaxed bg-brand-primary text-white animate-fade-in">
          {message.content}
        </div>
      </div>
    );
  }

  const hasError = Boolean(message.validationError);

  return (
    <div className="flex justify-start animate-fade-in">
      <div className="max-w-[95%] w-full space-y-2">
        <div className="flex items-center gap-2 pl-1">
          <AIBadge label="Analista" />
        </div>
        <div
          className={`rounded-lg px-4 py-3 text-body whitespace-pre-wrap leading-relaxed border ${
            hasError
              ? "bg-warning-bg/40 text-warning border-warning-border/40"
              : "bg-surface-secondary text-text-primary border-soft"
          }`}
        >
          {message.content}
          {typeof message.rowCount === "number" && !hasError && (
            <div className="text-code-sm text-text-tertiary mt-2">
              {message.rowCount} fila{message.rowCount === 1 ? "" : "s"} devuelta
              {message.rowCount === 1 ? "" : "s"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
