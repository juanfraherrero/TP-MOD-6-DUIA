"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AugmentModal, type AugmentPatch } from "./AugmentModal";
import {
  MultiSelectChips,
  type Term,
} from "./MultiSelectChips";
import {
  GalleryUploader,
  type GalleryImage,
} from "./GalleryUploader";
import { Spinner } from "@/components/ui/Spinner";
import { parseCoordsFromMapsUrl } from "@/lib/maps/parse-coords";
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
  lat: string;
  lng: string;
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
  lat: "",
  lng: "",
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
  lat?: number | string | null;
  lng?: number | string | null;
  gallery?: GalleryImage[];
  departments?: { id: string; name: string; slug: string }[];
  classifications?: { id: string; name: string; slug: string }[];
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
    lat: initial?.lat != null && initial.lat !== "" ? String(initial.lat) : "",
    lng: initial?.lng != null && initial.lng !== "" ? String(initial.lng) : "",
  }));

  // Estado del extractor de coordenadas — input throw-away (no se persiste).
  const [mapsUrlInput, setMapsUrlInput] = useState("");
  const [extractingCoords, setExtractingCoords] = useState(false);
  const [coordsFeedback, setCoordsFeedback] = useState<
    { kind: "success" | "error"; message: string } | null
  >(null);

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

  // Galería + taxonomías (Fase 4).
  const [gallery, setGallery] = useState<GalleryImage[]>(
    () => initial?.gallery ?? [],
  );
  const [departmentIds, setDepartmentIds] = useState<string[]>(
    () => initial?.departments?.map((d) => d.id) ?? [],
  );
  const [classificationIds, setClassificationIds] = useState<string[]>(
    () => initial?.classifications?.map((c) => c.id) ?? [],
  );

  // Catálogo de taxonomías cargado al montar. Si la fetch falla seguimos
  // funcionando con listas vacías — el admin verá los selectores sin opciones.
  const [departments, setDepartments] = useState<Term[]>(
    () => initial?.departments ?? [],
  );
  const [classifications, setClassifications] = useState<Term[]>(
    () => initial?.classifications ?? [],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/taxonomies")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: { departments: Term[]; classifications: Term[] }) => {
        if (cancelled) return;
        // Mergeamos con lo que ya tenemos (por si initial trae IDs que aún no
        // están en el catálogo cargado — caso raro pero posible).
        setDepartments((curr) => mergeTerms(data.departments, curr));
        setClassifications((curr) => mergeTerms(data.classifications, curr));
      })
      .catch(() => {
        // Silencio: las opciones quedan en lo que vino del initial.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function createClassification(name: string): Promise<Term> {
    const res = await fetch("/api/taxonomies/classifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Ya existe o no se pudo crear");
    }
    const created = (await res.json()) as Term;
    setClassifications((curr) => mergeTerms([created], curr));
    return created;
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

  async function extractCoordsFromUrl() {
    const url = mapsUrlInput.trim();
    if (!url) return;
    setCoordsFeedback(null);
    setExtractingCoords(true);
    try {
      // Intento client-side primero — si la URL ya es expandida, evitamos
      // un round-trip al server.
      const direct = parseCoordsFromMapsUrl(url);
      if (direct) {
        setValues((v) => ({
          ...v,
          lat: String(direct.lat),
          lng: String(direct.lng),
        }));
        setCoordsFeedback({ kind: "success", message: "Coordenadas extraídas" });
        return;
      }
      // Fallback server: resuelve redirects (maps.app.goo.gl, etc.).
      const res = await fetch("/api/maps/resolve-coords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        setCoordsFeedback({
          kind: "error",
          message:
            "No pude extraer coordenadas. Pegá una URL del formato `.../@LAT,LNG,...` o ingresá lat/lng manualmente.",
        });
        return;
      }
      const data = (await res.json()) as { lat: number; lng: number };
      setValues((v) => ({
        ...v,
        lat: String(data.lat),
        lng: String(data.lng),
      }));
      setCoordsFeedback({ kind: "success", message: "Coordenadas extraídas" });
    } catch {
      setCoordsFeedback({
        kind: "error",
        message: "No pude extraer coordenadas. Probá pegar una URL completa.",
      });
    } finally {
      setExtractingCoords(false);
    }
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
      lat: values.lat.trim() ? Number(values.lat) : null,
      lng: values.lng.trim() ? Number(values.lng) : null,
      gallery,
      departmentIds,
      classificationIds,
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
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <SectionBlock title="Identidad" subtitle="Cómo se presenta la actividad">
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

        <Field label="Imagen principal">
          <ImageUploadBlock
            uploading={uploading}
            imageUrl={values.imageUrl}
            onUpload={handleImageUpload}
            onRemove={() => setValues((v) => ({ ...v, imageUrl: "" }))}
          />
        </Field>
      </SectionBlock>

      <SectionBlock
        title="Galería"
        subtitle="Fotos adicionales con caption opcional"
      >
        <GalleryUploader value={gallery} onChange={setGallery} />
      </SectionBlock>

      <SectionBlock
        title="Clasificación"
        subtitle="Departamento(s) y categoría(s) — alimentan la búsqueda semántica"
      >
        <MultiSelectChips
          label="Departamentos"
          options={departments}
          values={departmentIds}
          onChange={setDepartmentIds}
          placeholder="Buscar departamento (ej. Chilecito)"
        />
        <MultiSelectChips
          label="Clasificaciones"
          options={classifications}
          values={classificationIds}
          onChange={setClassificationIds}
          allowCreate={createClassification}
          placeholder="Buscar o crear (ej. Bodegas)"
        />
      </SectionBlock>

      <SectionBlock
        title="Ubicación"
        subtitle="Coordenadas geográficas — alimentan el mini-mapa de la propuesta"
      >
        <Field label="Pegar URL de Google Maps">
          <div className="flex gap-2 items-start">
            <input
              type="url"
              value={mapsUrlInput}
              onChange={(e) => {
                setMapsUrlInput(e.target.value);
                if (coordsFeedback) setCoordsFeedback(null);
              }}
              placeholder="https://www.google.com/maps/place/… o https://maps.app.goo.gl/…"
              className="input flex-1"
            />
            <button
              type="button"
              onClick={extractCoordsFromUrl}
              disabled={!mapsUrlInput.trim() || extractingCoords}
              className="btn-secondary border border-medium hover:text-text-primary whitespace-nowrap"
            >
              {extractingCoords ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size={14} />
                  Extrayendo...
                </span>
              ) : (
                "Extraer coordenadas"
              )}
            </button>
          </div>
          {coordsFeedback && (
            <p
              className={
                coordsFeedback.kind === "success"
                  ? "mt-2 text-btn text-info"
                  : "mt-2 text-btn text-warning"
              }
            >
              {coordsFeedback.message}
            </p>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Latitud">
            <input
              type="number"
              step="any"
              min={-90}
              max={90}
              value={values.lat}
              onChange={set("lat")}
              placeholder="-29.4131"
              className="input"
            />
          </Field>
          <Field label="Longitud">
            <input
              type="number"
              step="any"
              min={-180}
              max={180}
              value={values.lng}
              onChange={set("lng")}
              placeholder="-66.8559"
              className="input"
            />
          </Field>
        </div>
      </SectionBlock>

      <SectionBlock
        title="Vigencia y horarios"
        subtitle="Cuándo está disponible la actividad"
      >
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
          <div className="space-y-4 pt-2">
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
          </div>
        )}

        {recurrenceKind === "dates" && (
          <div className="space-y-4 pt-2">
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
                      className="flex items-center gap-2 bg-surface-primary border border-medium rounded-full px-3 py-1 text-btn text-text-primary"
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
          </div>
        )}
      </SectionBlock>

      <SectionBlock
        title="Detalles físicos"
        subtitle="Requisitos y exigencia para el visitante"
      >
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

        <div className="grid grid-cols-2 gap-4">
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
        </div>
      </SectionBlock>

      <SectionBlock title="Comercial" subtitle="Precio y visibilidad">
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

        <label className="flex items-center gap-2 text-body text-text-primary cursor-pointer select-none">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={set("isActive")}
            className="h-4 w-4 accent-brand-primary"
          />
          <span>Activa (visible para clientes)</span>
        </label>
      </SectionBlock>

      <div className="flex flex-wrap gap-3 pt-4 border-t border-soft">
        <button
          type="submit"
          disabled={submitting || uploading}
          className="btn-primary-cta"
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
          className="btn-outline-cta"
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
        currentValues={{
          title: values.title,
          description: values.description,
          imageUrl: values.imageUrl,
          startDate: values.startDate,
          endDate: values.endDate,
          requirements: values.requirements,
          physicalPrep: values.physicalPrep,
          altitudeM: values.altitudeM,
          elevationGainM: values.elevationGainM,
          priceArs: values.priceArs,
          isActive: values.isActive,
          lat: values.lat,
          lng: values.lng,
        }}
        currentDepartmentIds={departmentIds}
        currentClassificationIds={classificationIds}
        availableDepartments={departments}
        availableClassifications={classifications}
        onApply={(patch: AugmentPatch) => {
          // Mergeamos respetando los campos ya cargados: solo pisamos con
          // valores no vacíos (el modal ya filtra vacíos antes de mandar).
          // Las coordenadas siguen la misma lógica de los textos: si el form
          // ya tiene lat/lng cargados, NO los pisamos (el admin ya decidió);
          // si están vacíos, aplicamos el sugerido.
          const {
            departmentIds: patchDeptIds,
            classificationIds: patchClassIds,
            lat: patchLat,
            lng: patchLng,
            ...textPatch
          } = patch;
          setValues((v) => {
            const merged: FormValues = { ...v, ...textPatch };
            const hasFormCoords =
              v.lat.trim() !== "" && v.lng.trim() !== "";
            if (
              !hasFormCoords &&
              patchLat !== undefined &&
              patchLng !== undefined
            ) {
              merged.lat = patchLat;
              merged.lng = patchLng;
            }
            return merged;
          });
          if (patchDeptIds && patchDeptIds.length > 0) {
            // Merge — no reemplazo. El admin ya pudo haber seleccionado algunos
            // manualmente; las sugerencias aprobadas se suman.
            setDepartmentIds((curr) =>
              Array.from(new Set([...curr, ...patchDeptIds])),
            );
          }
          if (patchClassIds && patchClassIds.length > 0) {
            setClassificationIds((curr) =>
              Array.from(new Set([...curr, ...patchClassIds])),
            );
          }
          setAugmentOpen(false);
        }}
      />
    </form>
  );
}

function mergeTerms(primary: Term[], extras: Term[]): Term[] {
  const seen = new Set(primary.map((t) => t.id));
  return [...primary, ...extras.filter((t) => !seen.has(t.id))];
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

function SectionBlock({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface-secondary border border-soft rounded-lg p-6 space-y-4">
      {title && (
        <header className="space-y-1 -mb-1">
          <h2 className="text-h3 text-text-primary">{title}</h2>
          {subtitle && (
            <p className="text-btn text-text-tertiary">{subtitle}</p>
          )}
        </header>
      )}
      {children}
    </section>
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
      className="inline-flex p-1 rounded-full bg-surface-primary border border-medium gap-1"
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
    <div className="bg-surface-primary border border-soft rounded-md p-4 space-y-3">
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
