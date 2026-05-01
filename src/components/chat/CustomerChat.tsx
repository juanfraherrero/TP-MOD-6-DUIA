"use client";

import Image from "next/image";
import { useState, useRef, useEffect, type FormEvent } from "react";
import { track, getSessionId } from "@/lib/analytics/track";
import { AIBadge } from "@/components/ui/AIBadge";
import { PhaseDot } from "@/components/ui/PhaseDot";
import { ChatErrorBanner } from "@/components/ui/ChatErrorBanner";
import { MiniMap } from "@/components/ui/MiniMap";

type GalleryImage = {
  full: string | null;
  thumb: string | null;
  caption: string | null;
};

type TaxonomyRef = { name: string; slug: string };

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
  // Campos nuevos del retrieve (Fase 2). El RAG los devuelve siempre — si la
  // actividad no los tiene, vienen como null/[]. La UI decide qué mostrar.
  lat: number | null;
  lng: number | null;
  gallery: GalleryImage[];
  departments: TaxonomyRef[];
  classifications: TaxonomyRef[];
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

const SUGGESTIONS: { label: string; query: string }[] = [
  { label: "Talampaya", query: "Quiero conocer el Parque Nacional Talampaya" },
  { label: "Cuesta de Miranda", query: "Quiero ir a la Cuesta de Miranda" },
  { label: "Ruta del Vino", query: "Mostrame la Ruta del Vino de La Rioja" },
];

function MapPinIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function SendIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  );
}

function renderMarkdownLite(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
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

  useEffect(() => {
    getSessionId();
    track("page_view", { referrer: document.referrer || null });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase, phaseLog, hasError]);

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
    callApi(messages);
  }

  function pickSuggestion(query: string) {
    setInput(query);
  }

  const isEmpty = messages.length === 0;

  return (
    <section className="relative h-[100dvh] w-full overflow-hidden">
      {/* Photo background — full bleed */}
      <Image
        src="/images/image-1.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />

      {/* Gradient overlay (legibility) — más oscuro abajo cuando hay messages */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isEmpty
            ? "linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 35%, transparent 60%), linear-gradient(to bottom, rgba(0,0,0,0.20) 0%, transparent 30%)"
            : "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.30) 50%, rgba(0,0,0,0.20) 100%)",
        }}
      />

      {/* Top nav */}
      <TopNav />

      {/* Main content — h-full + flex column para que solo la lista scrollee */}
      <div className="relative z-10 flex h-full flex-col">
        {/* spacer para compensar el nav fijo */}
        <div className="h-18 shrink-0" />

        {isEmpty ? (
          <div className="flex flex-1 items-center justify-center px-4 pb-40 pt-8">
            <HeroCard
              suggestions={SUGGESTIONS}
              onPick={pickSuggestion}
              disabled={loading}
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 pb-40 pt-8">
            <div className="mx-auto w-full max-w-hero space-y-6">
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
                            isLast ? "text-white" : "text-white/60"
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
          </div>
        )}
      </div>

      {/* Floating glass input bar */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={send}
        loading={loading}
      />
    </section>
  );
}

function TopNav() {
  return (
    <header className="absolute top-0 inset-x-0 z-20 flex h-18 items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <Image
          src="/images/icon-1.png"
          alt=""
          width={120}
          height={40}
          className="h-9 w-auto"
          priority
        />
        <span className="text-white text-link leading-tight">
          Gobierno
          <br />
          de La Rioja
        </span>
      </div>
      <nav className="hidden items-center gap-8 sm:flex">
        <a
          href="#"
          className="text-link text-white/80 hover:text-white transition-colors"
        >
          Servicios
        </a>
        <a
          href="#"
          className="text-link text-white/80 hover:text-white transition-colors"
        >
          Noticias
        </a>
        <a
          href="#"
          className="text-link text-white/80 hover:text-white transition-colors"
        >
          Portal Ciudadano
        </a>
      </nav>
    </header>
  );
}

function HeroCard({
  suggestions,
  onPick,
  disabled,
}: {
  suggestions: { label: string; query: string }[];
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="glass-panel mx-auto w-full max-w-hero p-12 sm:p-14 animate-fade-in">
      <div className="flex flex-col items-center text-center">
        <span className="text-eyebrow uppercase text-white/60">
          Gobierno de La Rioja · Turismo
        </span>
        <h1 className="mt-6 text-hero text-white text-shadow-hero">
          Agente de Turismo de La Rioja
        </h1>
        <p className="mt-4 max-w-[480px] text-body-span text-white/70">
          Bienvenido al asistente inteligente para descubrir los encantos de La
          Rioja.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {suggestions.map((s) => (
            <button
              key={s.label}
              type="button"
              disabled={disabled}
              onClick={() => onPick(s.query)}
              className="glass-chip focus-glow inline-flex items-center gap-2 px-4 py-2.5 text-link text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MapPinIcon className="size-3.5" />
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Msg }) {
  const isUser = message.role === "user";
  const hasProposals = !isUser && message.ranked && message.ranked.length > 0;

  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[85%] rounded-2xl px-4 py-3 text-body whitespace-pre-wrap bg-brand-primary text-white shadow-glass-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start animate-fade-in">
      <div className="max-w-[90%] w-full space-y-3">
        <div className="flex items-center gap-2 pl-1">
          <AIBadge label="Asesor" variant="glass" />
        </div>
        <div className="space-y-4">
          <div className="glass-panel px-4 py-3 text-body whitespace-pre-wrap text-white"
               style={{ borderRadius: 16 }}>
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
            <div
              className="glass-panel px-4 py-3 text-body italic text-white/80"
              style={{ borderRadius: 16 }}
            >
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

  // Hero: imageUrl → primer item de gallery → nada (sin hero).
  const hero =
    activity.imageUrl ??
    activity.gallery?.find((g) => g.full)?.full ??
    null;

  const hasCoords = activity.lat != null && activity.lng != null;

  // Chips departamento (verde) + clasificación (gris). Mostramos primeros 3
  // del total combinado para no saturar la card.
  const allChips: { label: string; variant: "brand" | "neutral"; key: string }[] = [
    ...(activity.departments ?? []).map((d) => ({
      label: d.name,
      variant: "brand" as const,
      key: `d:${d.slug}`,
    })),
    ...(activity.classifications ?? []).map((c) => ({
      label: c.name,
      variant: "neutral" as const,
      key: `c:${c.slug}`,
    })),
  ];
  const visibleChips = allChips.slice(0, 3);
  const overflowChips = allChips.length - visibleChips.length;

  return (
    <div
      className="glass-panel overflow-hidden text-white"
      style={{ borderRadius: 16 }}
      onClick={handleClick}
    >
      {hero && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={hero}
          alt={activity.title}
          className="w-full h-48 object-cover"
        />
      )}
      <div className="p-6 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-eyebrow uppercase text-white/60 mb-1">
              Propuesta {rank}
            </div>
            <h3 className="text-h4 text-white">{activity.title}</h3>
          </div>
          <div className="text-h4 text-white whitespace-nowrap" style={{ fontWeight: 590 }}>
            ${Number(activity.priceArs).toLocaleString("es-AR")}
          </div>
        </div>

        {visibleChips.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {visibleChips.map((c) => (
              <li
                key={c.key}
                className={
                  c.variant === "brand"
                    ? "inline-flex items-center h-6 px-2.5 rounded-full bg-brand-primary/20 text-white border border-brand-primary/40 text-code-sm font-medium"
                    : "inline-flex items-center h-6 px-2.5 rounded-full bg-white/10 text-white/85 border border-white/15 text-code-sm"
                }
              >
                {c.label}
              </li>
            ))}
            {overflowChips > 0 && (
              <li
                className="inline-flex items-center h-6 px-2.5 rounded-full bg-white/10 text-white/70 border border-white/15 text-code-sm"
                title={allChips.slice(3).map((c) => c.label).join(", ")}
              >
                +{overflowChips}
              </li>
            )}
          </ul>
        )}

        <p className="text-[13px] leading-[19.5px] text-white/60">
          {new Date(activity.startDate).toLocaleDateString("es-AR")} →{" "}
          {new Date(activity.endDate).toLocaleDateString("es-AR")}
        </p>
        <p className="text-body text-white/85">{pitch}</p>

        {hasCoords && (
          <MiniMap
            lat={activity.lat as number}
            lng={activity.lng as number}
            title={activity.title}
          />
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleInterested();
            }}
            disabled={converted}
            className={
              converted
                ? "inline-flex items-center gap-2 h-10 px-4 rounded-xl text-button bg-brand-primary/15 text-white border border-brand-primary/40 cursor-default"
                : "btn-primary-cta"
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
      className="glass-input fixed bottom-8 left-1/2 z-20 flex w-[min(720px,calc(100%-32px))] -translate-x-1/2 items-center gap-2 px-3 py-2"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        placeholder="Escribí tu mensaje…"
        className="flex-1 bg-transparent border-0 outline-none px-3 py-2.5 text-white placeholder:text-white/50 text-body disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="btn-primary-cta"
      >
        <SendIcon className="size-4" />
        Enviar
      </button>
    </form>
  );
}
