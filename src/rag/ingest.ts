import { getDataSource } from "@/db/data-source";
import type { Activity } from "@/db/entities";
import { createLogger } from "@/lib/logger";
import type { Recurrence, WeekDay } from "@/lib/validation/recurrence";
import { embedDocument, toVectorLiteral } from "./embeddings";

const log = createLogger("rag:ingest");

type ActivityInput = Pick<
  Activity,
  | "title"
  | "description"
  | "requirements"
  | "physicalPrep"
  | "altitudeM"
  | "elevationGainM"
  | "startDate"
  | "endDate"
  | "recurrence"
>;

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

// Helpers para formatear fechas en español argentino, sin depender del runtime
// locale. Se usan en la línea de horario que se embebe.
const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const DAY_NAMES_ES: Record<WeekDay, string> = {
  mon: "lunes",
  tue: "martes",
  wed: "miércoles",
  thu: "jueves",
  fri: "viernes",
  sat: "sábados",
  sun: "domingos",
};

// "lunes y martes" / "lunes, martes y sábados"
function joinEs(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function formatLongEs(d: Date): string {
  return `${d.getUTCDate()} de ${MONTHS_ES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

function formatMonthYearEs(d: Date): string {
  return `${MONTHS_ES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

function buildScheduleLine(a: ActivityInput): string {
  const recurrence = a.recurrence ?? null;
  if (recurrence === null) {
    return `Fecha única: ${formatLongEs(new Date(a.startDate))}.`;
  }
  if (recurrence.kind === "weekly") {
    const days = recurrence.days.map((d) => DAY_NAMES_ES[d]);
    const window = `${formatMonthYearEs(new Date(a.startDate))} y ${formatMonthYearEs(new Date(a.endDate))}`;
    return `Se realiza todos los ${joinEs(days)} de ${recurrence.startTime} a ${recurrence.endTime}, disponible entre ${window}.`;
  }
  // kind === "dates"
  const dates = recurrence.dates
    .slice(0, 8)
    .map((iso) => {
      const [y, m, d] = iso.split("-").map(Number);
      return formatLongEs(new Date(Date.UTC(y, m - 1, d)));
    });
  const tail = recurrence.dates.length > 8 ? " (entre otras)" : "";
  return `Fechas disponibles: ${joinEs(dates)}${tail}. Horario ${recurrence.startTime} a ${recurrence.endTime}.`;
}

export function buildActivityText(a: ActivityInput): string {
  const parts: string[] = [
    `Título: ${a.title}`,
    `Descripción: ${a.description}`,
    `Requisitos: ${a.requirements}`,
    `Preparación física: ${a.physicalPrep}`,
    `Horario: ${buildScheduleLine(a)}`,
  ];
  if (a.altitudeM != null) parts.push(`Altitud máxima: ${a.altitudeM} metros`);
  if (a.elevationGainM != null) parts.push(`Desnivel: ${a.elevationGainM} metros`);
  return parts.join("\n");
}

// Type export por si otro módulo lo necesita (ej. el grafo de augment).
export type { Recurrence };

export function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];
  const stride = CHUNK_SIZE - CHUNK_OVERLAP;
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += stride) {
    chunks.push(text.slice(start, start + CHUNK_SIZE));
    if (start + CHUNK_SIZE >= text.length) break;
  }
  return chunks;
}

export async function ingestActivity(
  activityId: string,
  data: ActivityInput,
): Promise<void> {
  log.info("iniciando ingesta", { activityId });
  const endTotal = log.time("ingesta completa");

  const ds = await getDataSource();
  const text = buildActivityText(data);
  const chunks = chunkText(text);
  log.info(`texto → ${chunks.length} chunk(s)`, { totalChars: text.length });

  await ds.query(`DELETE FROM activity_chunks WHERE activity_id = $1`, [
    activityId,
  ]);

  for (let i = 0; i < chunks.length; i++) {
    const vec = await embedDocument(chunks[i]);
    await ds.query(
      `INSERT INTO activity_chunks (activity_id, chunk_index, chunk_text, embedding)
       VALUES ($1, $2, $3, $4::vector)`,
      [activityId, i, chunks[i], toVectorLiteral(vec)],
    );
    log.debug(`chunk ${i + 1}/${chunks.length} guardado`);
  }

  endTotal();
  log.info("ingesta ok", { activityId, chunks: chunks.length });
}
