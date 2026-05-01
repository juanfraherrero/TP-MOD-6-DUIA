"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AIBadge } from "@/components/ui/AIBadge";
import { Spinner } from "@/components/ui/Spinner";
import { PhaseDot } from "@/components/ui/PhaseDot";
import { ChatErrorBanner } from "@/components/ui/ChatErrorBanner";
import type { Term } from "./MultiSelectChips";

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
  // Coordenadas — el modal sólo las lee para decidir si pre-acepta el
  // sugerido del agente o no (no las edita).
  lat: string;
  lng: string;
};

// Subset de FormValues que se puede mergear al aplicar — solo los campos que
// el agente aumenta. Incluye también los IDs de tax sugeridos (se mergean
// con los que ya tenía el form, no reemplazan) y las coordenadas sugeridas
// (el padre decide si las aplica o respeta las que ya cargó el admin).
export type AugmentPatch = Partial<
  Pick<
    FormValues,
    "description" | "requirements" | "physicalPrep" | "altitudeM" | "elevationGainM"
  >
> & {
  departmentIds?: string[];
  classificationIds?: string[];
  lat?: string;
  lng?: string;
};

type AugmentedFields = {
  description: string;
  requirements: string;
  physicalPrep: string;
  altitudeM: number | null;
  elevationGainM: number | null;
  suggestedLat?: number | null;
  suggestedLng?: number | null;
  ragNotes: string;
  suggestedClassificationSlugs?: string[];
  suggestedDepartmentSlugs?: string[];
};

type Source = { url: string; title: string };

type Props = {
  open: boolean;
  onClose: () => void;
  currentValues: FormValues;
  // Catálogo + selección actual del form padre. Necesario para resolver los
  // slugs sugeridos por el agente a IDs concretos antes de mergear.
  currentDepartmentIds: string[];
  currentClassificationIds: string[];
  availableDepartments: Term[];
  availableClassifications: Term[];
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
  suggestedDepartmentSlugs: string[];
  suggestedClassificationSlugs: string[];
  // Coordenadas sugeridas por el LLM. null = el agente no sugirió nada.
  // Mantenemos el tipo numérico acá (no string) porque vienen del SSE así y
  // el toggle UI sólo necesita formatearlas — la conversión a string para
  // el form padre se hace en handleApply.
  suggestedLat: number | null;
  suggestedLng: number | null;
};

export function AugmentModal({
  open,
  onClose,
  currentValues,
  currentDepartmentIds,
  currentClassificationIds,
  availableDepartments,
  availableClassifications,
  onApply,
}: Props) {
  const [phase, setPhase] = useState<string | null>(null);
  const [phaseLog, setPhaseLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [proposal, setProposal] = useState<EditableProposal | null>(null);
  const [ragNotes, setRagNotes] = useState<string>("");
  const [sources, setSources] = useState<Source[]>([]);
  // Selección de chips sugeridos (slugs activos para aceptar al "Aplicar").
  const [acceptedDeptSlugs, setAcceptedDeptSlugs] = useState<Set<string>>(
    new Set(),
  );
  const [acceptedClassSlugs, setAcceptedClassSlugs] = useState<Set<string>>(
    new Set(),
  );
  // Toggle de aceptación para las coordenadas sugeridas. Se pre-acepta por
  // default si el agente las trae y el form padre las tiene vacías.
  const [acceptCoords, setAcceptCoords] = useState(false);

  // Necesitamos un ref al currentValues para usarlo en el fetch sin capturar
  // valores viejos en efectos estables.
  const currentRef = useRef(currentValues);
  currentRef.current = currentValues;

  // Lookup: slug → Term, sobre el catálogo. Si el LLM devuelve un slug que no
  // está en el catálogo lo descartamos silenciosamente al renderizar.
  const deptBySlug = useMemo(() => {
    const m = new Map<string, Term>();
    availableDepartments.forEach((d) => m.set(d.slug, d));
    return m;
  }, [availableDepartments]);

  const classBySlug = useMemo(() => {
    const m = new Map<string, Term>();
    availableClassifications.forEach((c) => m.set(c.slug, c));
    return m;
  }, [availableClassifications]);

  // IDs ya seleccionados en el form padre (set para lookup rápido).
  const currentDeptIdSet = useMemo(
    () => new Set(currentDepartmentIds),
    [currentDepartmentIds],
  );
  const currentClassIdSet = useMemo(
    () => new Set(currentClassificationIds),
    [currentClassificationIds],
  );

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
    setAcceptedDeptSlugs(new Set());
    setAcceptedClassSlugs(new Set());
    setAcceptCoords(false);

    const abort = new AbortController();
    runAugment(currentRef.current, abort.signal)
      .then((result) => {
        if (abort.signal.aborted) return;
        setProposal(result.proposal);
        setRagNotes(result.ragNotes);
        setSources(result.sources);
        // Pre-seleccionar todas las sugerencias que existan en el catálogo y
        // no estén ya en el form. La idea: el admin acepta por default y
        // descarta lo que no le sirva (UX más rápida).
        setAcceptedDeptSlugs(
          new Set(
            result.proposal.suggestedDepartmentSlugs.filter((slug) => {
              const t = deptBySlug.get(slug);
              return t && !currentDeptIdSet.has(t.id);
            }),
          ),
        );
        setAcceptedClassSlugs(
          new Set(
            result.proposal.suggestedClassificationSlugs.filter((slug) => {
              const t = classBySlug.get(slug);
              return t && !currentClassIdSet.has(t.id);
            }),
          ),
        );
        // Pre-aceptamos coordenadas sólo si el agente las trae Y el form
        // padre las tiene vacías. Si el admin ya cargó lat/lng, no tocamos
        // su trabajo por default — sigue pudiendo opt-in con el chip.
        const hasCoords =
          result.proposal.suggestedLat != null &&
          result.proposal.suggestedLng != null;
        const formHasCoords =
          currentRef.current.lat?.trim() !== "" &&
          currentRef.current.lng?.trim() !== "";
        setAcceptCoords(hasCoords && !formHasCoords);
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
        suggestedDepartmentSlugs:
          finalAugmented.suggestedDepartmentSlugs ?? [],
        suggestedClassificationSlugs:
          finalAugmented.suggestedClassificationSlugs ?? [],
        suggestedLat:
          typeof finalAugmented.suggestedLat === "number"
            ? finalAugmented.suggestedLat
            : null,
        suggestedLng:
          typeof finalAugmented.suggestedLng === "number"
            ? finalAugmented.suggestedLng
            : null,
      },
      ragNotes: finalAugmented.ragNotes ?? "",
      sources: finalSources,
    };
  }

  function toggleDept(slug: string) {
    setAcceptedDeptSlugs((curr) => {
      const next = new Set(curr);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function toggleClass(slug: string) {
    setAcceptedClassSlugs((curr) => {
      const next = new Set(curr);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
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

    // Resolver slugs aceptados a IDs (descartar los que no estén en catálogo).
    const deptIds: string[] = [];
    acceptedDeptSlugs.forEach((slug) => {
      const t = deptBySlug.get(slug);
      if (t) deptIds.push(t.id);
    });
    const classIds: string[] = [];
    acceptedClassSlugs.forEach((slug) => {
      const t = classBySlug.get(slug);
      if (t) classIds.push(t.id);
    });
    if (deptIds.length > 0) patch.departmentIds = deptIds;
    if (classIds.length > 0) patch.classificationIds = classIds;

    // Coordenadas: solo se incluyen si el toggle está aceptado y ambos ejes
    // son válidos. El padre decide la política de merge (no pisa si ya hay).
    if (
      acceptCoords &&
      proposal.suggestedLat != null &&
      proposal.suggestedLng != null
    ) {
      patch.lat = String(proposal.suggestedLat);
      patch.lng = String(proposal.suggestedLng);
    }

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
    setAcceptedDeptSlugs(new Set());
    setAcceptedClassSlugs(new Set());
    setAcceptCoords(false);
    const abort = new AbortController();
    runAugment(currentRef.current, abort.signal)
      .then((result) => {
        setProposal(result.proposal);
        setRagNotes(result.ragNotes);
        setSources(result.sources);
        setAcceptedDeptSlugs(
          new Set(
            result.proposal.suggestedDepartmentSlugs.filter((slug) => {
              const t = deptBySlug.get(slug);
              return t && !currentDeptIdSet.has(t.id);
            }),
          ),
        );
        setAcceptedClassSlugs(
          new Set(
            result.proposal.suggestedClassificationSlugs.filter((slug) => {
              const t = classBySlug.get(slug);
              return t && !currentClassIdSet.has(t.id);
            }),
          ),
        );
        const hasCoords =
          result.proposal.suggestedLat != null &&
          result.proposal.suggestedLng != null;
        const formHasCoords =
          currentRef.current.lat?.trim() !== "" &&
          currentRef.current.lng?.trim() !== "";
        setAcceptCoords(hasCoords && !formHasCoords);
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

  // Suggestions resueltas: solo las que estén efectivamente en el catálogo.
  const deptSuggestions = (proposal?.suggestedDepartmentSlugs ?? [])
    .map((slug) => ({ slug, term: deptBySlug.get(slug) }))
    .filter((s): s is { slug: string; term: Term } => Boolean(s.term));
  const classSuggestions = (proposal?.suggestedClassificationSlugs ?? [])
    .map((slug) => ({ slug, term: classBySlug.get(slug) }))
    .filter((s): s is { slug: string; term: Term } => Boolean(s.term));

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
                <div className="bg-surface-primary border border-soft rounded-lg p-4">
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

              {(deptSuggestions.length > 0 || classSuggestions.length > 0) && (
                <div className="bg-surface-primary border border-soft rounded-lg p-4 space-y-4">
                  {classSuggestions.length > 0 && (
                    <SuggestionGroup
                      title="Clasificaciones sugeridas"
                      hint="Tocá para aceptar o descartar antes de aplicar."
                      items={classSuggestions}
                      accepted={acceptedClassSlugs}
                      currentIds={currentClassIdSet}
                      onToggle={toggleClass}
                    />
                  )}
                  {deptSuggestions.length > 0 && (
                    <SuggestionGroup
                      title="Departamentos sugeridos"
                      hint="Tocá para aceptar o descartar antes de aplicar."
                      items={deptSuggestions}
                      accepted={acceptedDeptSlugs}
                      currentIds={currentDeptIdSet}
                      onToggle={toggleDept}
                    />
                  )}
                </div>
              )}

              {proposal.suggestedLat != null && proposal.suggestedLng != null && (
                <CoordsSuggestion
                  lat={proposal.suggestedLat}
                  lng={proposal.suggestedLng}
                  formHasCoords={
                    currentValues.lat.trim() !== "" &&
                    currentValues.lng.trim() !== ""
                  }
                  accepted={acceptCoords}
                  onToggle={() => setAcceptCoords((v) => !v)}
                />
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
            className="btn-primary-cta"
          >
            Usar propuesta
          </button>
        </footer>
      </div>
    </div>
  );
}

function CoordsSuggestion({
  lat,
  lng,
  formHasCoords,
  accepted,
  onToggle,
}: {
  lat: number;
  lng: number;
  formHasCoords: boolean;
  accepted: boolean;
  onToggle: () => void;
}) {
  const formatted = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  return (
    <div className="bg-surface-primary border border-soft rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <AIBadge label="IA" />
        <p className="text-h4 text-text-primary">Coordenadas sugeridas</p>
      </div>
      <p className="text-btn text-text-tertiary mb-3">
        {formHasCoords
          ? "Ya cargaste lat/lng en el formulario; aceptar las pisará."
          : "Tocá para aceptar o descartar antes de aplicar."}
      </p>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={accepted}
        className={
          accepted
            ? "inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/30 text-code-sm font-medium transition-colors hover:bg-brand-primary/15"
            : "inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-transparent text-text-secondary border border-medium border-dashed text-code-sm transition-colors hover:text-text-primary hover:border-brand-primary/40"
        }
        title={
          accepted
            ? "Aceptado — se aplicará al guardar"
            : "Tocá para aceptar"
        }
      >
        <span aria-hidden="true">{accepted ? "✓" : "+"}</span>
        <span className="font-mono">{formatted}</span>
        {formHasCoords && accepted && (
          <span className="text-text-tertiary">·pisa</span>
        )}
      </button>
    </div>
  );
}

function SuggestionGroup({
  title,
  hint,
  items,
  accepted,
  currentIds,
  onToggle,
}: {
  title: string;
  hint?: string;
  items: { slug: string; term: Term }[];
  accepted: Set<string>;
  currentIds: Set<string>;
  onToggle: (slug: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <AIBadge label="IA" />
        <p className="text-h4 text-text-primary">{title}</p>
      </div>
      {hint && (
        <p className="text-btn text-text-tertiary mb-3">{hint}</p>
      )}
      <ul className="flex flex-wrap gap-2">
        {items.map(({ slug, term }) => {
          const isAccepted = accepted.has(slug);
          const alreadyInForm = currentIds.has(term.id);
          return (
            <li key={slug}>
              <button
                type="button"
                onClick={() => onToggle(slug)}
                className={
                  isAccepted
                    ? "inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/30 text-code-sm font-medium transition-colors hover:bg-brand-primary/15"
                    : "inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-transparent text-text-secondary border border-medium border-dashed text-code-sm transition-colors hover:text-text-primary hover:border-brand-primary/40"
                }
                aria-pressed={isAccepted}
                title={
                  alreadyInForm
                    ? "Ya está seleccionado en el formulario"
                    : isAccepted
                      ? "Aceptado — se sumará al aplicar"
                      : "Tocá para aceptar"
                }
              >
                <span aria-hidden="true">{isAccepted ? "✓" : "+"}</span>
                <span>{term.name}</span>
                {alreadyInForm && (
                  <span className="text-text-tertiary">·ya</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
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
          <pre className="mt-2 p-3 bg-surface-primary border border-soft rounded-md whitespace-pre-wrap font-sans text-btn text-text-primary">
            {original}
          </pre>
        </details>
      )}
    </div>
  );
}
