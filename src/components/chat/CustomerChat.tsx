"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import { track, getSessionId } from "@/lib/analytics/track";
import { AIBadge } from "@/components/ui/AIBadge";
import { PhaseDot } from "@/components/ui/PhaseDot";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { ChatErrorBanner } from "@/components/ui/ChatErrorBanner";

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

const SUGGESTIONS = [
  "quiero hacer trekking en Patagonia con presupuesto 80k",
  "Sierra de la Ventana",
  "algo tranquilo para mi abuela",
];

function renderMarkdownLite(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-text-primary">
          {part.slice(2, -2)}
        </strong>
      );
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
  const [hasError, setHasError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Page view inicial + warm up del sessionId.
  useEffect(() => {
    getSessionId();
    track("page_view", { referrer: document.referrer || null });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase, phaseLog, hasError]);

  // Núcleo del request — recibe los mensajes a mandar (incluyendo el último
  // user message) y maneja el SSE. Tanto send() como retry() lo invocan.
  async function callApi(messagesToSend: Msg[]) {
    setLoading(true);
    setPhase(null);
    setPhaseLog([]);
    setHasError(false);

    try {
      const res = await fetch("/api/chat/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: getSessionId(),
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
        ...messagesToSend,
        {
          role: "assistant",
          content: finalResponse ?? "No pude generar una respuesta.",
          ranked: finalRanked,
          closingMessage: finalClosing,
        },
      ]);
    } catch (err) {
      // El error técnico se loguea acá, no se muestra al usuario.
      console.error("[customer-chat] request failed:", err);
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

    const userMsgIndex = messages.filter((m) => m.role === "user").length;
    track("chat_message_sent", {
      messageIndex: userMsgIndex,
      length: text.length,
    });

    const newMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    callApi(newMessages);
  }

  function retry() {
    if (loading) return;
    // messages ya contiene el último user message que falló — re-ejecutamos
    // con esa misma cola.
    callApi(messages);
  }

  return (
    <div className="flex flex-col h-screen w-full max-w-6xl mx-auto bg-surface-primary">
      <header className="px-4 sm:px-6 h-18 flex flex-col justify-center shadow-l1">
        <h1 className="text-h3 text-text-primary">Agencia de Turismo — Asesor</h1>
        <p className="text-[13px] leading-[19.5px] text-text-secondary mt-0.5">
          Contame qué tenés ganas de hacer y te armo un ranking de propuestas.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {messages.length === 0 && (
          <EmptyState
            disabled={loading}
            onPick={(s) => setInput(s)}
          />
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}

        {loading && (
          <div className="space-y-3 pl-1 animate-fade-in">
            {phaseLog.map((p, i) => {
              const isLast = i === phaseLog.length - 1;
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 text-btn"
                >
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

      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={send}
        loading={loading}
      />
    </div>
  );
}

function EmptyState({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (s: string) => void;
}) {
  return (
    <div className="relative flex flex-col items-center justify-center text-center py-20 space-y-6 animate-fade-in">
      <AuroraBackground />
      <AIBadge label="Asistente" />
      <h2 className="text-h3 text-text-primary">¿Qué viaje tenés en mente?</h2>
      <div className="flex flex-wrap justify-center gap-2 max-w-xl pt-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="focus-glow px-3 h-8 rounded-full bg-surface-soft border border-medium text-btn text-text-muted hover:bg-surface-tertiary hover:border-strong hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Msg }) {
  const isUser = message.role === "user";
  const hasProposals = !isUser && message.ranked && message.ranked.length > 0;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg px-4 py-3 text-body whitespace-pre-wrap bg-brand-primary text-white">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start animate-fade-in">
      <div className="max-w-[90%] w-full space-y-3">
        <div className="flex items-center gap-2 pl-1">
          <AIBadge label="Asesor" />
        </div>
        <div className="space-y-4">
          <div className="rounded-lg px-4 py-3 text-body whitespace-pre-wrap bg-surface-secondary border border-soft text-text-primary">
            {renderMarkdownLite(message.content)}
          </div>
          {hasProposals && (
            <div className="space-y-4">
              {message.ranked!.map((r) => (
                <ProposalCard key={r.activity.id} proposal={r} />
              ))}
            </div>
          )}
          {message.closingMessage && (
            <div className="rounded-lg px-4 py-3 text-body italic text-text-secondary bg-surface-soft border border-soft">
              {renderMarkdownLite(message.closingMessage)}
            </div>
          )}
        </div>
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
      className="bg-surface-primary border border-soft rounded-lg overflow-hidden hover:border-strong transition-colors"
      onClick={handleClick}
    >
      {activity.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activity.imageUrl}
          alt={activity.title}
          className="w-full h-48 object-cover rounded-t-lg"
        />
      )}
      <div className="p-6 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[12.25px] leading-[15.925px] uppercase tracking-wide text-text-secondary mb-1">
              Propuesta {rank}
            </div>
            <h3 className="text-h4 text-text-primary">{activity.title}</h3>
          </div>
          <div
            className="text-h4 text-text-primary whitespace-nowrap"
            style={{ fontWeight: 590 }}
          >
            ${Number(activity.priceArs).toLocaleString("es-AR")}
          </div>
        </div>
        <p className="text-[13px] leading-[19.5px] text-text-secondary">
          {new Date(activity.startDate).toLocaleDateString("es-AR")} →{" "}
          {new Date(activity.endDate).toLocaleDateString("es-AR")}
        </p>
        <p className="text-body text-text-primary">{pitch}</p>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleInterested();
            }}
            disabled={converted}
            className={
              converted
                ? "h-8 px-3 rounded-full text-btn font-medium bg-brand-primary/10 text-brand-accent border border-brand-primary/30 cursor-default transition-colors"
                : "btn-primary"
            }
          >
            {converted ? "¡Te contactamos!" : "Me interesa"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatInput({
  value,
  onChange,
  onSubmit,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  loading: boolean;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="px-4 sm:px-6 py-3 sm:py-4 flex gap-2 border-t border-soft bg-surface-primary"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        placeholder="Escribí tu mensaje..."
        className="input flex-1"
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="btn-primary"
      >
        Enviar
      </button>
    </form>
  );
}

