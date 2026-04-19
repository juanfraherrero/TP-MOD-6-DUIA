"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";

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
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase, phaseLog]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const newMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setPhase(null);
    setPhaseLog([]);
    setError(null);

    try {
      const res = await fetch("/api/chat/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map(({ role, content }) => ({ role, content })),
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
        ...newMessages,
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
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
      setPhase(null);
    }
  }

  function pickSuggestion(s: string) {
    if (loading) return;
    setInput(s);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-white border rounded-lg overflow-hidden">
      <header className="p-4 border-b bg-gray-50">
        <h1 className="text-lg font-semibold">
          Dashboard — Consultas en lenguaje natural
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Preguntá sobre los datos de analytics. El sistema genera SQL, la
          valida (solo SELECT, tablas permitidas, LIMIT), ejecuta y resume.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">Ejemplos de consultas:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => pickSuggestion(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-300 hover:bg-gray-100 text-gray-700"
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
          <div className="space-y-2">
            {phaseLog.map((p, i) => {
              const isLast = i === phaseLog.length - 1;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-2 text-sm ${
                    isLast ? "text-gray-700" : "text-gray-400"
                  }`}
                >
                  {isLast ? (
                    <Spinner />
                  ) : (
                    <span className="h-4 w-4 flex items-center justify-center text-green-600">
                      ✓
                    </span>
                  )}
                  <span>{PHASE_LABELS[p] ?? p}</span>
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="text-red-600 text-sm p-3 bg-red-50 border border-red-200 rounded">
            {error}
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      <form onSubmit={send} className="border-t p-4 flex gap-2 bg-white">
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
          className="bg-black text-white px-4 py-2 rounded text-sm disabled:opacity-50"
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
        <div className="max-w-[85%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed bg-black text-white">
          {message.content}
        </div>
      </div>
    );
  }

  const hasSql = Boolean(message.generatedSql);
  const hasError = Boolean(message.validationError);

  return (
    <div className="flex justify-start">
      <div className="max-w-[95%] w-full space-y-2">
        <div
          className={`rounded-lg px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
            hasError
              ? "bg-amber-50 text-amber-900 border border-amber-200"
              : "bg-gray-100 text-gray-900"
          }`}
        >
          {message.content}
          {typeof message.rowCount === "number" && !hasError && (
            <div className="text-xs text-gray-500 mt-2">
              {message.rowCount} fila{message.rowCount === 1 ? "" : "s"} devuelta
              {message.rowCount === 1 ? "" : "s"}
            </div>
          )}
        </div>
        {hasSql && <SqlBlock sql={message.generatedSql!} reasoning={message.sqlReasoning} />}
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
      className="bg-gray-900 text-gray-100 rounded-lg text-xs overflow-hidden"
    >
      <summary className="px-3 py-2 cursor-pointer select-none font-mono text-[11px] text-gray-300 hover:bg-gray-800">
        {open ? "▼" : "▶"} SQL generado
        {reasoning ? ` — ${reasoning}` : ""}
      </summary>
      <pre className="px-3 pb-3 overflow-x-auto whitespace-pre-wrap text-[11px] leading-relaxed">
{sql}
      </pre>
    </details>
  );
}

function Spinner() {
  return (
    <div className="h-4 w-4 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
  );
}
