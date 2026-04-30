"use client";

import { useEffect, useRef, useState } from "react";
import { AIBadge } from "@/components/ui/AIBadge";
import { Spinner } from "@/components/ui/Spinner";
import { PhaseDot } from "@/components/ui/PhaseDot";
import { ChatErrorBanner } from "@/components/ui/ChatErrorBanner";

// Shape del form que consume el componente padre (ActivityForm).
// Los campos numéricos vienen como string (inputs de texto) — al aplicar
// convertimos las altitudes.
type FormValues = {
  title: string;
  description: string;
  imageUrl: string;
  startDate: string;
  endDate: string;
  requirements: string;
  physicalPrep: string;
  altitudeM: string;
  elevationGainM: string;
  priceArs: string;
  isActive: boolean;
};

// Subset de FormValues que se puede mergear al aplicar — solo los campos que
// el agente aumenta.
export type AugmentPatch = Partial<
  Pick<
    FormValues,
    "description" | "requirements" | "physicalPrep" | "altitudeM" | "elevationGainM"
  >
>;

type AugmentedFields = {
  description: string;
  requirements: string;
  physicalPrep: string;
  altitudeM: number | null;
  elevationGainM: number | null;
  ragNotes: string;
};

type Source = { url: string; title: string };

type Props = {
  open: boolean;
  onClose: () => void;
  currentValues: FormValues;
  onApply: (patch: AugmentPatch) => void;
};

const PHASE_LABELS: Record<string, string> = {
  extract_context: "Analizando contexto",
  web_research: "Buscando info en la web",
  synthesize: "Sintetizando campos",
  emit_response: "Finalizando",
};

// Valores editables de la propuesta en la modal. Strings para los campos
// numéricos para alinear con el shape del form padre.
type EditableProposal = {
  description: string;
  requirements: string;
  physicalPrep: string;
  altitudeM: string;
  elevationGainM: string;
};

export function AugmentModal({ open, onClose, currentValues, onApply }: Props) {
  const [phase, setPhase] = useState<string | null>(null);
  const [phaseLog, setPhaseLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [proposal, setProposal] = useState<EditableProposal | null>(null);
  const [ragNotes, setRagNotes] = useState<string>("");
  const [sources, setSources] = useState<Source[]>([]);

  // Necesitamos un ref al currentValues para usarlo en el fetch sin capturar
  // valores viejos en efectos estables.
  const currentRef = useRef(currentValues);
  currentRef.current = currentValues;

  useEffect(() => {
    if (!open) return;
    // Reseteamos estado cada vez que se abre y disparamos el fetch.
    setPhase(null);
    setPhaseLog([]);
    setLoading(true);
    setHasError(false);
    setProposal(null);
    setRagNotes("");
    setSources([]);

    const abort = new AbortController();
    runAugment(currentRef.current, abort.signal)
      .then((result) => {
        if (abort.signal.aborted) return;
        setProposal(result.proposal);
        setRagNotes(result.ragNotes);
        setSources(result.sources);
        setLoading(false);
      })
      .catch((err) => {
        if (abort.signal.aborted) return;
        console.error("[augment-modal] request failed:", err);
        setHasError(true);
        setLoading(false);
      });

    return () => abort.abort();
    // Solo re-disparar cuando se abre la modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Helper interno para hacer el fetch + parsear SSE + actualizar phase log
  // mientras llegan los eventos "node".
  async function runAugment(
    values: FormValues,
    signal: AbortSignal,
  ): Promise<{
    proposal: EditableProposal;
    ragNotes: string;
    sources: Source[];
  }> {
    const body = {
      title: values.title,
      description: values.description,
      requirements: values.requirements,
      physicalPrep: values.physicalPrep,
      altitudeM: values.altitudeM ? Number(values.altitudeM) : null,
      elevationGainM: values.elevationGainM
        ? Number(values.elevationGainM)
        : null,
    };

    const res = await fetch("/api/activities/augment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok || !res.body) {
      const maybeJson = await res.json().catch(() => ({}));
      throw new Error(
        typeof maybeJson.error === "string"
          ? maybeJson.error
          : `HTTP ${res.status}`,
      );
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalAugmented: AugmentedFields | undefined;
    let finalSources: Source[] = [];

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
          const d = data as { node: string };
          setPhase(d.node);
          setPhaseLog((prev) => [...prev, d.node]);
        } else if (evt === "done") {
          const d = data as {
            augmented?: AugmentedFields;
            sources?: Source[];
          };
          finalAugmented = d.augmented;
          finalSources = d.sources ?? [];
        } else if (evt === "error") {
          const d = data as { message: string };
          throw new Error(d.message);
        }
      }
    }

    if (!finalAugmented) {
      throw new Error("El servidor no devolvió una propuesta.");
    }

    return {
      proposal: {
        description: finalAugmented.description ?? "",
        requirements: finalAugmented.requirements ?? "",
        physicalPrep: finalAugmented.physicalPrep ?? "",
        altitudeM:
          finalAugmented.altitudeM != null
            ? String(finalAugmented.altitudeM)
            : "",
        elevationGainM:
          finalAugmented.elevationGainM != null
            ? String(finalAugmented.elevationGainM)
            : "",
      },
      ragNotes: finalAugmented.ragNotes ?? "",
      sources: finalSources,
    };
  }

  function handleApply() {
    if (!proposal) return;
    // No pisar campos con valor vacío si ya había contenido — ver §9 del
    // informe. El merge se delega al padre, pero filtramos acá para no
    // mandarle strings vacíos cuando la propuesta no aportó nada.
    const patch: AugmentPatch = {};
    if (proposal.description.trim()) patch.description = proposal.description;
    if (proposal.requirements.trim()) patch.requirements = proposal.requirements;
    if (proposal.physicalPrep.trim()) patch.physicalPrep = proposal.physicalPrep;
    if (proposal.altitudeM.trim()) patch.altitudeM = proposal.altitudeM;
    if (proposal.elevationGainM.trim())
      patch.elevationGainM = proposal.elevationGainM;
    onApply(patch);
  }

  function handleRetry() {
    // Truco simple: re-disparar el efecto cerrando y re-abriendo. En vez de
    // eso, llamamos a la lógica directamente para no requerir toggle externo.
    setPhase(null);
    setPhaseLog([]);
    setLoading(true);
    setHasError(false);
    setProposal(null);
    setRagNotes("");
    setSources([]);
    const abort = new AbortController();
    runAugment(currentRef.current, abort.signal)
      .then((result) => {
        setProposal(result.proposal);
        setRagNotes(result.ragNotes);
        setSources(result.sources);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[augment-modal] request failed:", err);
        setHasError(true);
        setLoading(false);
      });
  }

  if (!open) return null;

  // El estado `phase` se setea para tracking interno; lo referenciamos para
  // que el linter no marque como unused (la UI usa `phaseLog`).
  void phase;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-modal-backdrop backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-surface-secondary border border-soft rounded-lg shadow-l2 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col text-text-primary">
        <header className="px-6 py-4 border-b border-soft flex items-start justify-between gap-4">
          <div>
            <h2 className="text-h3 text-text-primary">Aumentar con IA</h2>
            <p className="text-btn text-text-tertiary mt-1">
              Investigamos en la web y reescribimos los campos para optimizar la
              búsqueda semántica. Revisá, editá y aplicá.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary text-xl leading-none transition-colors"
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
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
              {phaseLog.length === 0 && (
                <div className="flex items-center gap-3 text-btn text-text-tertiary">
                  <Spinner />
                  <span>Iniciando…</span>
                </div>
              )}
            </div>
          )}

          {hasError && !loading && (
            <ChatErrorBanner
              onRetry={handleRetry}
              message="No pude completar la propuesta. Reintentá en unos segundos."
            />
          )}

          {!loading && !hasError && proposal && (
            <>
              {sources.length > 0 && (
                <div className="bg-surface-secondary border border-soft rounded-lg p-4">
                  <p className="text-h4 text-text-primary mb-2">
                    Fuentes consultadas
                  </p>
                  <ul className="space-y-1">
                    {sources.map((s, i) => (
                      <li key={i}>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-link text-brand-primary hover:text-brand-accent break-all transition-colors"
                        >
                          {s.title || s.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {ragNotes.trim() && (
                <div className="bg-info-bg border border-info-border text-text-primary rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AIBadge label="RAG" />
                    <p className="text-h4 text-text-primary">
                      Ajustes para mejor búsqueda
                    </p>
                  </div>
                  <p className="text-body text-text-primary">{ragNotes}</p>
                </div>
              )}

              <ProposalField
                label="Descripción"
                original={currentValues.description}
                value={proposal.description}
                onChange={(v) =>
                  setProposal((p) => (p ? { ...p, description: v } : p))
                }
                rows={6}
                type="textarea"
              />
              <ProposalField
                label="Requisitos"
                original={currentValues.requirements}
                value={proposal.requirements}
                onChange={(v) =>
                  setProposal((p) => (p ? { ...p, requirements: v } : p))
                }
                rows={3}
                type="textarea"
              />
              <ProposalField
                label="Preparación física"
                original={currentValues.physicalPrep}
                value={proposal.physicalPrep}
                onChange={(v) =>
                  setProposal((p) => (p ? { ...p, physicalPrep: v } : p))
                }
                rows={3}
                type="textarea"
              />
              <div className="grid grid-cols-2 gap-4">
                <ProposalField
                  label="Altitud máx. (m)"
                  original={currentValues.altitudeM}
                  value={proposal.altitudeM}
                  onChange={(v) =>
                    setProposal((p) => (p ? { ...p, altitudeM: v } : p))
                  }
                  type="number"
                />
                <ProposalField
                  label="Desnivel (m)"
                  original={currentValues.elevationGainM}
                  value={proposal.elevationGainM}
                  onChange={(v) =>
                    setProposal((p) => (p ? { ...p, elevationGainM: v } : p))
                  }
                  type="number"
                />
              </div>
            </>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-soft flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={loading || !proposal}
            className="btn-primary"
          >
            Usar propuesta
          </button>
        </footer>
      </div>
    </div>
  );
}

function ProposalField({
  label,
  original,
  value,
  onChange,
  rows,
  type,
}: {
  label: string;
  original: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  type: "textarea" | "number";
}) {
  const hasOriginal = Boolean(original?.trim());

  return (
    <div>
      <label className="block text-h4 text-text-primary mb-2">{label}</label>
      {type === "textarea" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows ?? 3}
          className="input min-h-[80px]"
        />
      ) : (
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input"
        />
      )}
      {hasOriginal && (
        <details className="mt-2 text-btn text-text-tertiary">
          <summary className="cursor-pointer hover:text-text-primary transition-colors">
            Ver original
          </summary>
          <pre className="mt-2 p-3 bg-surface-secondary border border-soft rounded-md whitespace-pre-wrap font-sans text-btn text-text-primary">
            {original}
          </pre>
        </details>
      )}
    </div>
  );
}

