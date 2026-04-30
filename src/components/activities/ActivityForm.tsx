"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AugmentModal, type AugmentPatch } from "./AugmentModal";
import { Spinner } from "@/components/ui/Spinner";
import type { Recurrence, WeekDay } from "@/lib/validation/recurrence";

type RecurrenceKind = "once" | "weekly" | "dates";

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

const empty: FormValues = {
  title: "",
  description: "",
  imageUrl: "",
  startDate: "",
  endDate: "",
  requirements: "",
  physicalPrep: "",
  altitudeM: "",
  elevationGainM: "",
  priceArs: "",
  isActive: true,
};

// Para "Una vez" usamos datetime-local (hora exacta). Para "Semanal" /
// "Fechas" usamos date puro en los campos de validez + time HH:MM aparte.
function toDatetimeLocal(d: string | Date | undefined | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60000).toISOString().slice(0, 16);
}

function toDateInput(d: string | Date | undefined | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60000).toISOString().slice(0, 10);
}

export type ActivityFormInitial = {
  id?: string;
  title?: string;
  description?: string;
  imageUrl?: string | null;
  startDate?: string | Date;
  endDate?: string | Date;
  requirements?: string;
  physicalPrep?: string;
  altitudeM?: number | null;
  elevationGainM?: number | null;
  priceArs?: string | number;
  isActive?: boolean;
  recurrence?: Recurrence | null;
};

// Días de la semana en orden argentino (lunes primero).
const WEEK_DAYS: { key: WeekDay; label: string }[] = [
  { key: "mon", label: "Lun" },
  { key: "tue", label: "Mar" },
  { key: "wed", label: "Mié" },
  { key: "thu", label: "Jue" },
  { key: "fri", label: "Vie" },
  { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
];

const RECURRENCE_OPTIONS: { value: RecurrenceKind; label: string }[] = [
  { value: "once", label: "Una vez" },
  { value: "weekly", label: "Semanal" },
  { value: "dates", label: "Fechas específicas" },
];

export function ActivityForm({ initial }: { initial?: ActivityFormInitial }) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);

  const initialKind: RecurrenceKind = initial?.recurrence
    ? initial.recurrence.kind
    : "once";

  const [recurrenceKind, setRecurrenceKind] =
    useState<RecurrenceKind>(initialKind);

  const [values, setValues] = useState<FormValues>(() => ({
    ...empty,
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    imageUrl: initial?.imageUrl ?? "",
    startDate:
      initialKind === "once"
        ? toDatetimeLocal(initial?.startDate)
        : toDateInput(initial?.startDate),
    endDate:
      initialKind === "once"
        ? toDatetimeLocal(initial?.endDate)
        : toDateInput(initial?.endDate),
    requirements: initial?.requirements ?? "",
    physicalPrep: initial?.physicalPrep ?? "",
    altitudeM: initial?.altitudeM != null ? String(initial.altitudeM) : "",
    elevationGainM:
      initial?.elevationGainM != null ? String(initial.elevationGainM) : "",
    priceArs: initial?.priceArs != null ? String(initial.priceArs) : "",
    isActive: initial?.isActive ?? true,
  }));

  // Estado específico del modo semanal.
  const [weeklyDays, setWeeklyDays] = useState<WeekDay[]>(() =>
    initial?.recurrence?.kind === "weekly" ? initial.recurrence.days : [],
  );
  const [weeklyStartTime, setWeeklyStartTime] = useState<string>(() =>
    initial?.recurrence?.kind === "weekly" ? initial.recurrence.startTime : "09:00",
  );
  const [weeklyEndTime, setWeeklyEndTime] = useState<string>(() =>
    initial?.recurrence?.kind === "weekly" ? initial.recurrence.endTime : "17:00",
  );

  // Estado específico del modo "fechas específicas".
  const [specificDates, setSpecificDates] = useState<string[]>(() =>
    initial?.recurrence?.kind === "dates" ? initial.recurrence.dates : [],
  );
  const [newDateInput, setNewDateInput] = useState<string>("");
  const [datesStartTime, setDatesStartTime] = useState<string>(() =>
    initial?.recurrence?.kind === "dates" ? initial.recurrence.startTime : "09:00",
  );
  const [datesEndTime, setDatesEndTime] = useState<string>(() =>
    initial?.recurrence?.kind === "dates" ? initial.recurrence.endTime : "17:00",
  );

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [augmentOpen, setAugmentOpen] = useState(false);

  function set<K extends keyof FormValues>(key: K) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      const target = e.target;
      const val =
        target instanceof HTMLInputElement && target.type === "checkbox"
          ? target.checked
          : target.value;
      setValues((v) => ({ ...v, [key]: val } as FormValues));
    };
  }

  function toggleWeeklyDay(day: WeekDay) {
    setWeeklyDays((curr) =>
      curr.includes(day) ? curr.filter((d) => d !== day) : [...curr, day],
    );
  }

  function addSpecificDate() {
    if (!newDateInput) return;
    setSpecificDates((curr) =>
      curr.includes(newDateInput) ? curr : [...curr, newDateInput].sort(),
    );
    setNewDateInput("");
  }

  function removeSpecificDate(d: string) {
    setSpecificDates((curr) => curr.filter((x) => x !== d));
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error subiendo imagen");
      }
      const { url } = await res.json();
      setValues((v) => ({ ...v, imageUrl: url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error subiendo imagen");
    } finally {
      setUploading(false);
    }
  }

  // Cambio de modo: no reseteamos los campos comunes, solo cambiamos el
  // formato de los inputs de start/end según si el modo necesita hora exacta
  // o solo fecha.
  function changeRecurrenceKind(kind: RecurrenceKind) {
    setRecurrenceKind(kind);
    setValues((v) => {
      // Convertir valores existentes al nuevo formato si hace falta.
      if (kind === "once") {
        return {
          ...v,
          startDate: v.startDate ? toDatetimeLocal(v.startDate) : "",
          endDate: v.endDate ? toDatetimeLocal(v.endDate) : "",
        };
      }
      return {
        ...v,
        startDate: v.startDate ? toDateInput(v.startDate) : "",
        endDate: v.endDate ? toDateInput(v.endDate) : "",
      };
    });
  }

  function buildRecurrencePayload(): Recurrence | null {
    if (recurrenceKind === "once") return null;
    if (recurrenceKind === "weekly") {
      return {
        kind: "weekly",
        days: weeklyDays,
        startTime: weeklyStartTime,
        endTime: weeklyEndTime,
      };
    }
    return {
      kind: "dates",
      dates: specificDates,
      startTime: datesStartTime,
      endTime: datesEndTime,
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Validación cliente del lado del modo — rápido y preciso.
    if (recurrenceKind === "weekly" && weeklyDays.length === 0) {
      setSubmitting(false);
      setError("Elegí al menos un día de la semana para el horario semanal.");
      return;
    }
    if (recurrenceKind === "dates" && specificDates.length === 0) {
      setSubmitting(false);
      setError("Agregá al menos una fecha para el modo fechas específicas.");
      return;
    }

    const payload = {
      title: values.title,
      description: values.description,
      imageUrl: values.imageUrl || null,
      startDate: values.startDate,
      endDate: values.endDate,
      requirements: values.requirements,
      physicalPrep: values.physicalPrep,
      altitudeM: values.altitudeM ? Number(values.altitudeM) : null,
      elevationGainM: values.elevationGainM
        ? Number(values.elevationGainM)
        : null,
      priceArs: Number(values.priceArs),
      isActive: values.isActive,
      recurrence: buildRecurrencePayload(),
    };

    try {
      const url = isEdit
        ? `/api/activities/${initial!.id}`
        : "/api/activities";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : JSON.stringify(data.errors ?? data) ?? "Error",
        );
      }
      router.push("/admin/activities");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando");
    } finally {
      setSubmitting(false);
    }
  }

  const dateInputType =
    recurrenceKind === "once" ? "datetime-local" : "date";
  const dateLabelStart =
    recurrenceKind === "once" ? "Fecha y hora de inicio" : "Válida desde";
  const dateLabelEnd =
    recurrenceKind === "once" ? "Fecha y hora de fin" : "Válida hasta";

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl">
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Field label="Título" required>
        <input
          type="text"
          required
          maxLength={200}
          value={values.title}
          onChange={set("title")}
          className="input"
        />
      </Field>

      <Field label="Descripción" required>
        <textarea
          required
          rows={5}
          value={values.description}
          onChange={set("description")}
          className="input min-h-[80px]"
        />
      </Field>

      <Field label="Imagen">
        <ImageUploadBlock
          uploading={uploading}
          imageUrl={values.imageUrl}
          onUpload={handleImageUpload}
          onRemove={() => setValues((v) => ({ ...v, imageUrl: "" }))}
        />
      </Field>

      <Field label="Tipo de horario" required>
        <SegmentedControl
          options={RECURRENCE_OPTIONS}
          value={recurrenceKind}
          onChange={changeRecurrenceKind}
        />
        <p className="mt-2 text-btn text-text-tertiary">
          {recurrenceKind === "once" &&
            "Una única ocurrencia en la fecha y hora indicadas."}
          {recurrenceKind === "weekly" &&
            "Se repite todas las semanas en los días marcados, entre las fechas de validez."}
          {recurrenceKind === "dates" &&
            "Ocurre solo en las fechas explícitas que cargues."}
        </p>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label={dateLabelStart} required>
          <input
            type={dateInputType}
            required
            value={values.startDate}
            onChange={set("startDate")}
            className="input"
          />
        </Field>
        <Field label={dateLabelEnd} required>
          <input
            type={dateInputType}
            required
            value={values.endDate}
            onChange={set("endDate")}
            className="input"
          />
        </Field>
      </div>

      {recurrenceKind === "weekly" && (
        <SectionBlock>
          <Field label="Días de la semana" required>
            <div className="flex flex-wrap gap-2">
              {WEEK_DAYS.map((d) => {
                const checked = weeklyDays.includes(d.key);
                return (
                  <label
                    key={d.key}
                    className={`px-3 py-1.5 rounded-full cursor-pointer text-btn select-none transition-colors border ${
                      checked
                        ? "bg-brand-primary text-white border-brand-primary"
                        : "bg-transparent text-text-primary border-medium hover:bg-surface-soft"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleWeeklyDay(d.key)}
                      className="sr-only"
                    />
                    {d.label}
                  </label>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Hora de inicio" required>
              <input
                type="time"
                required
                value={weeklyStartTime}
                onChange={(e) => setWeeklyStartTime(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Hora de fin" required>
              <input
                type="time"
                required
                value={weeklyEndTime}
                onChange={(e) => setWeeklyEndTime(e.target.value)}
                className="input"
              />
            </Field>
          </div>
        </SectionBlock>
      )}

      {recurrenceKind === "dates" && (
        <SectionBlock>
          <Field label="Fechas específicas" required>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={newDateInput}
                onChange={(e) => setNewDateInput(e.target.value)}
                className="input"
              />
              <button
                type="button"
                onClick={addSpecificDate}
                disabled={!newDateInput}
                className="btn-secondary border border-medium hover:text-text-primary"
              >
                Agregar
              </button>
            </div>
            {specificDates.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {specificDates.map((d) => (
                  <li
                    key={d}
                    className="flex items-center gap-2 bg-surface-secondary border border-medium rounded-full px-3 py-1 text-btn text-text-primary"
                  >
                    <span>{d}</span>
                    <button
                      type="button"
                      onClick={() => removeSpecificDate(d)}
                      className="text-text-tertiary hover:text-text-primary leading-none transition-colors"
                      aria-label={`Quitar ${d}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Hora de inicio" required>
              <input
                type="time"
                required
                value={datesStartTime}
                onChange={(e) => setDatesStartTime(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Hora de fin" required>
              <input
                type="time"
                required
                value={datesEndTime}
                onChange={(e) => setDatesEndTime(e.target.value)}
                className="input"
              />
            </Field>
          </div>
        </SectionBlock>
      )}

      <Field label="Requisitos" required>
        <textarea
          required
          rows={3}
          value={values.requirements}
          onChange={set("requirements")}
          className="input min-h-[80px]"
        />
      </Field>

      <Field label="Preparación física" required>
        <textarea
          required
          rows={3}
          value={values.physicalPrep}
          onChange={set("physicalPrep")}
          className="input min-h-[80px]"
        />
      </Field>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Altitud máx. (m)">
          <input
            type="number"
            min={0}
            value={values.altitudeM}
            onChange={set("altitudeM")}
            className="input"
          />
        </Field>
        <Field label="Desnivel (m)">
          <input
            type="number"
            min={0}
            value={values.elevationGainM}
            onChange={set("elevationGainM")}
            className="input"
          />
        </Field>
        <Field label="Precio (ARS)" required>
          <input
            type="number"
            required
            min={0}
            step="0.01"
            value={values.priceArs}
            onChange={set("priceArs")}
            className="input"
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-body text-text-primary cursor-pointer select-none">
        <input
          type="checkbox"
          checked={values.isActive}
          onChange={set("isActive")}
          className="h-4 w-4 accent-brand-primary"
        />
        <span>Activa (visible para clientes)</span>
      </label>

      <div className="flex flex-wrap gap-3 pt-4 border-t border-soft">
        <button
          type="submit"
          disabled={submitting || uploading}
          className="btn-primary"
        >
          {submitting ? "Guardando..." : isEdit ? "Actualizar" : "Crear"}
        </button>
        <button
          type="button"
          onClick={() => setAugmentOpen(true)}
          disabled={!values.title.trim() || submitting || uploading}
          title={
            !values.title.trim()
              ? "Agregá un título primero para aumentar con IA"
              : "Completamos y reescribimos los campos a partir del título + info web"
          }
          className="h-8 px-3 rounded-full bg-transparent border border-brand-primary/30 text-brand-accent text-btn font-medium hover:bg-brand-primary/[0.08] hover:border-brand-primary/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Aumentar con IA
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/activities")}
          className="btn-secondary"
        >
          Cancelar
        </button>
      </div>

      <AugmentModal
        open={augmentOpen}
        onClose={() => setAugmentOpen(false)}
        currentValues={values}
        onApply={(patch: AugmentPatch) => {
          // Mergeamos respetando los campos ya cargados: solo pisamos con
          // valores no vacíos (el modal ya filtra vacíos antes de mandar).
          setValues((v) => ({ ...v, ...patch }));
          setAugmentOpen(false);
        }}
      />
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-h4 text-text-primary mb-2">
        {label}
        {required && (
          <span className="text-brand-primary ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function SectionBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface-secondary border border-soft rounded-lg p-6 space-y-4">
      {children}
    </div>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      className="inline-flex p-1 rounded-full bg-surface-secondary border border-medium gap-1"
    >
      {options.map((opt) => {
        const checked = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(opt.value)}
            className={`h-7 px-4 rounded-full text-btn font-medium transition-colors ${
              checked
                ? "bg-brand-primary text-white"
                : "bg-transparent text-text-tertiary hover:text-text-primary"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ImageUploadBlock({
  uploading,
  imageUrl,
  onUpload,
  onRemove,
}: {
  uploading: boolean;
  imageUrl: string;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="bg-surface-secondary border border-soft rounded-lg p-4 space-y-3">
      <label className="flex flex-col gap-2">
        <span className="text-btn text-text-tertiary">
          Seleccioná un archivo (JPG, PNG, WebP)
        </span>
        <input
          type="file"
          accept="image/*"
          onChange={onUpload}
          disabled={uploading}
          className="text-btn text-text-primary
            file:mr-3 file:h-8 file:px-3 file:rounded-full
            file:border-0 file:text-btn file:font-medium
            file:bg-cta-bg file:text-text-on-cta
            file:cursor-pointer hover:file:bg-cta-bg-hover
            file:transition-colors
            disabled:opacity-50"
        />
      </label>
      {uploading && (
        <div className="flex items-center gap-2 text-btn text-text-tertiary">
          <Spinner size={14} />
          <span>Subiendo...</span>
        </div>
      )}
      {imageUrl && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="max-h-48 rounded-lg border border-soft"
          />
          <button
            type="button"
            onClick={onRemove}
            className="text-btn text-text-tertiary hover:text-text-primary transition-colors"
          >
            Quitar imagen
          </button>
        </div>
      )}
    </div>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-warning-bg/40 border border-warning-border/40 text-warning p-3 rounded-md text-body whitespace-pre-wrap">
      {children}
    </div>
  );
}
