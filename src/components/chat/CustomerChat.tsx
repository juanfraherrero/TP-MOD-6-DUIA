"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import { track, getSessionId } from "@/lib/analytics/track";

type ActivityHit = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  priceArs: string;
  startDate: string;
  endDate: string;
  bestChunk: string;
  distance: number;
};

type RankedProposal = {
  activity: ActivityHit;
  pitch: string;
  rank: number;
};

type Msg = {
  role: "user" | "assistant";
  content: string;
  ranked?: RankedProposal[];
  closingMessage?: string;
};

const PHASE_LABELS: Record<string, string> = {
  input_guard: "Verificando scope del pedido",
  extract_intent: "Analizando tu pedido",
  web_enrich: "Consultando información del lugar",
  rag_retrieve: "Buscando en el catálogo",
  evaluate_match: "Evaluando los mejores matches",
  web_enrich_retry: "Ampliando búsqueda con contexto web (CRAG)",
  rank_and_explain: "Armando recomendaciones",
  guardrail_check: "Verificando scope de la respuesta",
  emit_response: "Finalizando",
};

function renderMarkdownLite(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export function CustomerChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<string | null>(null);
  const [phaseLog, setPhaseLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Page view inicial + warm up del sessionId.
  useEffect(() => {
    getSessionId();
    track("page_view", { referrer: document.referrer || null });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase, phaseLog]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMsgIndex = messages.filter((m) => m.role === "user").length;
    track("chat_message_sent", {
      messageIndex: userMsgIndex,
      length: text.length,
    });

    const newMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setPhase(null);
    setPhaseLog([]);
    setError(null);

    try {
      const res = await fetch("/api/chat/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: getSessionId(),
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
      let finalRanked: RankedProposal[] | undefined;
      let finalClosing: string | undefined;

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
                ranked?: RankedProposal[];
                closingMessage?: string;
              };
            };
            setPhase(d.node);
            setPhaseLog((prev) => [...prev, d.node]);
            if (d.state?.response) finalResponse = d.state.response;
            if (d.state?.ranked) finalRanked = d.state.ranked;
            if (d.state?.closingMessage)
              finalClosing = d.state.closingMessage;
          } else if (evt === "done") {
            const d = data as {
              response?: string;
              ranked?: RankedProposal[];
              closingMessage?: string;
            };
            finalResponse = d.response ?? finalResponse;
            finalRanked = d.ranked ?? finalRanked;
            finalClosing = d.closingMessage ?? finalClosing;
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
          ranked: finalRanked,
          closingMessage: finalClosing,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
      setPhase(null);
    }
  }

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto bg-white">
      <header className="p-4 border-b">
        <h1 className="text-xl font-semibold">Agencia de Turismo — Asesor</h1>
        <p className="text-sm text-gray-500">
          Contame qué tenés ganas de hacer y te armo un ranking de propuestas.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-gray-400 text-sm text-center py-8 space-y-2">
            <p>Probá con algo como:</p>
            <p className="italic">&ldquo;quiero hacer trekking en Patagonia con presupuesto 80k&rdquo;</p>
            <p className="italic">&ldquo;Sierra de la Ventana&rdquo;</p>
            <p className="italic">&ldquo;algo tranquilo para mi abuela&rdquo;</p>
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

      <form onSubmit={send} className="border-t p-4 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder="Escribí tu mensaje..."
          className="input flex-1"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-black text-white px-4 py-2 rounded text-sm disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: Msg }) {
  const isUser = message.role === "user";
  const hasProposals = !isUser && message.ranked && message.ranked.length > 0;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed bg-black text-white">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] space-y-3">
        <div className="rounded-lg px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed bg-gray-100 text-gray-900">
          {renderMarkdownLite(message.content)}
        </div>
        {hasProposals && (
          <div className="space-y-3">
            {message.ranked!.map((r) => (
              <ProposalCard key={r.activity.id} proposal={r} />
            ))}
          </div>
        )}
        {message.closingMessage && (
          <div className="rounded-lg px-4 py-3 text-sm italic text-gray-700 bg-gray-50 border border-gray-200">
            {renderMarkdownLite(message.closingMessage)}
          </div>
        )}
      </div>
    </div>
  );
}

function ProposalCard({ proposal }: { proposal: RankedProposal }) {
  const { activity, pitch, rank } = proposal;
  const [converted, setConverted] = useState(false);

  function handleClick() {
    track("proposal_clicked", { activityId: activity.id, rank });
  }

  function handleInterested() {
    if (converted) return;
    track("conversion", { activityId: activity.id });
    setConverted(true);
  }

  return (
    <div
      className="border rounded-lg overflow-hidden bg-white hover:shadow-md transition-shadow"
      onClick={handleClick}
    >
      {activity.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activity.imageUrl}
          alt={activity.title}
          className="w-full h-40 object-cover"
        />
      )}
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="text-xs text-gray-400">Propuesta {rank}</div>
            <h3 className="font-semibold text-sm">{activity.title}</h3>
          </div>
          <div className="text-sm font-semibold whitespace-nowrap">
            ${Number(activity.priceArs).toLocaleString("es-AR")}
          </div>
        </div>
        <p className="text-xs text-gray-500">
          {new Date(activity.startDate).toLocaleDateString("es-AR")} →{" "}
          {new Date(activity.endDate).toLocaleDateString("es-AR")}
        </p>
        <p className="text-sm text-gray-700 leading-relaxed">{pitch}</p>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleInterested();
            }}
            disabled={converted}
            className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
              converted
                ? "bg-green-100 text-green-700 border border-green-300"
                : "bg-black text-white hover:bg-gray-800"
            }`}
          >
            {converted ? "¡Te contactamos!" : "Me interesa"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="h-4 w-4 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
  );
}
