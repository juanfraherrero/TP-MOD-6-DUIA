import { createLogger } from "@/lib/logger";
import type { Recurrence, WeekDay } from "@/lib/validation/recurrence";

const log = createLogger("lib:recurrence");

// Horizonte de expansión: cuántos días hacia adelante desde "hoy" materializamos.
// Cap de sanity por actividad (previene patrones que generen miles de fechas).
const HORIZON_DAYS = 180;
const MAX_DATES = 365;

// Map weekday index (getUTCDay: 0=Sun..6=Sat) → short string.
const DOW_MAP: Record<number, WeekDay> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

function formatDate(d: Date): string {
  // ISO YYYY-MM-DD en UTC — evitamos TZ shifts al materializar available_dates.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIsoDate(iso: string): Date {
  // Interpretamos "YYYY-MM-DD" como día en UTC para consistencia entre pasos.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}
function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

function addDaysUTC(d: Date, n: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

function todayUTC(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function truncateToDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/**
 * Expande un patrón de recurrencia a un array de fechas ISO ("YYYY-MM-DD")
 * en las que la actividad tiene lugar, dentro del rango
 * [startDate, endDate] y acotado por el horizonte de 180 días desde hoy.
 *
 * - `recurrence === null` → `[formatDate(startDate)]` (actividad one-time).
 * - `kind: "weekly"` → itera días y filtra por `days[]`.
 * - `kind: "dates"` → filtra las fechas dentro del rango [startDate, endDate].
 *
 * Pure function — sin side effects más allá del log de warn si se capa.
 */
export function expandAvailableDates(
  recurrence: Recurrence | null,
  startDate: Date,
  endDate: Date,
): string[] {
  const start = truncateToDay(startDate);
  const end = truncateToDay(endDate);

  if (recurrence === null) {
    return [formatDate(start)];
  }

  if (recurrence.kind === "weekly") {
    const daysSet = new Set<WeekDay>(recurrence.days);
    const today = todayUTC();
    const horizonEnd = addDaysUTC(today, HORIZON_DAYS);

    // Ventana efectiva: [max(today, startDate) .. min(endDate, today+180)]
    // Incluimos fechas pasadas si startDate > today? Sí, arrancamos en start.
    // Pero CAP el futuro al horizonte para no explotar en patrones "10 años".
    const from = maxDate(start, today);
    const to = minDate(end, horizonEnd);

    const out: string[] = [];
    if (from.getTime() > to.getTime()) {
      log.warn("weekly: ventana vacía tras clip al horizonte", {
        startDate: formatDate(start),
        endDate: formatDate(end),
      });
      return out;
    }

    for (
      let cursor = new Date(from.getTime());
      cursor.getTime() <= to.getTime();
      cursor = addDaysUTC(cursor, 1)
    ) {
      const dow = DOW_MAP[cursor.getUTCDay()];
      if (daysSet.has(dow)) {
        out.push(formatDate(cursor));
        if (out.length >= MAX_DATES) {
          log.warn("weekly: truncado al cap de fechas", {
            cap: MAX_DATES,
            truncated: true,
          });
          break;
        }
      }
    }
    return out;
  }

  // kind: "dates" — lista explícita. Filtramos por el rango [start, end].
  // Incluimos pasadas (la lógica de "solo futuras" es responsabilidad del
  // retrieve — acá mantenemos la materialización completa para auditabilidad).
  const out: string[] = [];
  for (const iso of recurrence.dates) {
    const d = parseIsoDate(iso);
    if (d.getTime() < start.getTime() || d.getTime() > end.getTime()) continue;
    out.push(formatDate(d));
    if (out.length >= MAX_DATES) {
      log.warn("dates: truncado al cap de fechas", {
        cap: MAX_DATES,
      });
      break;
    }
  }
  // Dedupe y orden ascendente — el input del admin podría venir desordenado.
  return Array.from(new Set(out)).sort();
}
