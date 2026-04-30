"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import { AIBadge } from "@/components/ui/AIBadge";
import { PhaseDot } from "@/components/ui/PhaseDot";
import { ChatErrorBanner } from "@/components/ui/ChatErrorBanner";

type Msg = {
  role: "user" | "assistant";
  content: string;
  generatedSql?: string;
  sqlReasoning?: string;
  validationError?: string;
  rowCount?: number;
};

const PHASE_LABELS: Record<string, string> = {
  generate_sql: "Generando SQL desde tu pregunta",
  validate_sql: "Validando la query",
  execute_sql: "Ejecutando contra la base",
  summarize_result: "Resumiendo los resultados",
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
      let finalSql: string | undefined;
      let finalReasoning: string | undefined;
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
                generatedSql?: string;
                sqlReasoning?: string;
                validationError?: string;
                rowCount?: number;
              };
            };
            setPhase(d.node);
            setPhaseLog((prev) => [...prev, d.node]);
            if (d.state?.response) finalResponse = d.state.response;
            if (d.state?.generatedSql) finalSql = d.state.generatedSql;
            if (d.state?.sqlReasoning) finalReasoning = d.state.sqlReasoning;
            if (d.state?.validationError !== undefined) {
              finalValidationError = d.state.validationError || undefined;
            }
            if (typeof d.state?.rowCount === "number") {
              finalRowCount = d.state.rowCount;
            }
          } else if (evt === "done") {
            const d = data as {
              response?: string;
              generatedSql?: string;
              sqlReasoning?: string;
              validationError?: string;
              rowCount?: number;
            };
            finalResponse = d.response ?? finalResponse;
            finalSql = d.generatedSql ?? finalSql;
            finalReasoning = d.sqlReasoning ?? finalReasoning;
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
          generatedSql: finalSql,
          sqlReasoning: finalReasoning,
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
    <div className="flex flex-col w-full max-w-6xl mx-auto h-[calc(100vh-72px-48px)] sm:h-[calc(100vh-72px-80px)] bg-surface-secondary border border-soft rounded-lg overflow-hidden">
      <header className="px-4 sm:px-6 py-5 border-b border-soft">
        <h1 className="text-h3 text-text-primary">
          Dashboard — Consultas en lenguaje natural
        </h1>
        <p className="text-body text-text-secondary mt-1">
          Preguntá sobre los datos de analytics. El sistema genera SQL, la
          valida (solo SELECT, tablas permitidas, LIMIT), ejecuta y resume.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-body text-text-tertiary">Ejemplos de consultas:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => pickSuggestion(s)}
                  className="focus-glow h-8 px-3 rounded-full border border-medium text-btn text-text-tertiary hover:bg-surface-soft hover:text-text-primary transition-colors"
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
        className="border-t border-soft px-4 sm:px-6 py-3 sm:py-4 flex gap-2"
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
          className="btn-primary"
        >
          Consultar
        </button>
      </form>
    </div>
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

  const hasSql = Boolean(message.generatedSql);
  const hasError = Boolean(message.validationError);

  return (
    <div className="flex justify-start animate-fade-in">
      <div className="max-w-[95%] w-full space-y-2">
        <div className="flex items-center gap-2 pl-1">
          <AIBadge label="Analyst" />
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
        {hasSql && (
          <SqlBlock sql={message.generatedSql!} reasoning={message.sqlReasoning} />
        )}
      </div>
    </div>
  );
}

function SqlBlock({ sql, reasoning }: { sql: string; reasoning?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="bg-surface-overlay border border-soft rounded-lg overflow-hidden"
    >
      <summary className="px-3 py-2 cursor-pointer select-none font-mono text-code-sm text-text-tertiary hover:bg-surface-secondary hover:text-text-primary transition-colors flex items-start gap-2">
        <span className="text-text-tertiary mt-[1px]">{open ? "▼" : "▶"}</span>
        <span className="flex-1">
          SQL generado{reasoning ? ` — ${reasoning}` : ""}
        </span>
      </summary>
      <pre className="px-3 pb-3 pt-1 overflow-x-auto whitespace-pre-wrap font-mono text-code-sm leading-relaxed text-text-muted">
{sql}
      </pre>
    </details>
  );
}

