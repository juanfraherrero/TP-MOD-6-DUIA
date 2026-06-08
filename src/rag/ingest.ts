import { getDataSource } from "@/db/data-source";
import type { Activity, GalleryImage } from "@/db/entities/Activity";
import { createLogger } from "@/lib/logger";
import type { Recurrence, WeekDay } from "@/lib/validation/recurrence";
import {
  EMBEDDING_DIM,
  embedDocumentWithRetry,
  toVectorLiteral,
} from "./embeddings";

const log = createLogger("rag:ingest");

type TaxonomyLite = { name: string };

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
  | "audienceTags"
> & {
  // Las dos relaciones M:N entran al texto embeddeado como simples listas
  // de nombres. NO se filtran como WHERE en retrieve — el matching es 100%
  // semántico vía embedding. Ver §5.1/5.2 del plan.
  departments?: TaxonomyLite[];
  classifications?: TaxonomyLite[];
  // Captions de imágenes — opcional. Se filtran (ver looksLikeCleanCaption)
  // y se concatenan al texto para sumar señal semántica.
  gallery?: GalleryImage[];
};

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

// Limpia HTML / entidades comunes ANTES de embeddear. NO se persiste al DB —
// los campos crudos se guardan tal como llegan del form. Esto solo evita que
// el embedding aprenda ruido como "<p>" o "&nbsp;" cuando el admin pega texto
// con formato de un editor rico.
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// Filtro defensivo para captions ruidosas que escapan del scraper o del
// upload directo del admin (nombres de archivo, IMG_xxxx, solo símbolos).
// Caso real observado en el seed: "WhatsApp Image 2025-04-27 at...".
function looksLikeCleanCaption(caption: string): boolean {
  const trimmed = caption.trim();
  if (trimmed.length < 3) return false;
  if (/^WhatsApp Image/i.test(trimmed)) return false;
  if (/^IMG_\d+/i.test(trimmed)) return false;
  if (/^DSC_?\d+/i.test(trimmed)) return false;
  if (/^[\d\W_]+$/.test(trimmed)) return false; // solo dígitos/símbolos
  return true;
}

export function buildActivityText(a: ActivityInput): string {
  const parts: string[] = [
    `Título: ${a.title}`,
    `Descripción: ${stripHtml(a.description)}`,
    `Requisitos: ${stripHtml(a.requirements)}`,
    `Preparación física: ${stripHtml(a.physicalPrep)}`,
    `Horario: ${buildScheduleLine(a)}`,
  ];
  if (a.altitudeM != null) parts.push(`Altitud máxima: ${a.altitudeM} metros`);
  if (a.elevationGainM != null) parts.push(`Desnivel: ${a.elevationGainM} metros`);
  if (a.audienceTags && a.audienceTags.length > 0) {
    parts.push(`Públicos ideales: ${a.audienceTags.join(", ")}.`);
  }
  if (a.classifications && a.classifications.length > 0) {
    parts.push(
      `Categorías: ${a.classifications.map((c) => c.name).join(", ")}.`,
    );
  }
  if (a.departments && a.departments.length > 0) {
    parts.push(
      `Departamento: ${a.departments.map((d) => d.name).join(", ")}.`,
    );
  }
  // Captions de la galería al final — suman vocabulario natural ("Vista del
  // Cerro Catedral al amanecer") sin pisar la estructura de campos. Filtradas
  // para descartar nombres de archivo del scraper.
  if (a.gallery && a.gallery.length > 0) {
    const captions: string[] = [];
    for (const g of a.gallery) {
      const c = g.caption?.trim();
      if (c && looksLikeCleanCaption(c)) captions.push(c);
    }
    if (captions.length > 0) {
      parts.push(`Imágenes: ${captions.join(", ")}.`);
    }
  }
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
  const startTs = performance.now();
  const endTotal = log.time("ingesta completa");

  const ds = await getDataSource();
  const text = buildActivityText(data);
  const chunks = chunkText(text);
  log.info(`texto → ${chunks.length} chunk(s)`, {
    activityId,
    totalChars: text.length,
  });

  // Transacción completa: si cualquier embed o INSERT falla, rollback ⇒ los
  // chunks viejos se conservan intactos. Esto evita el estado intermedio
  // (delete previo + insert parcial = activity sin embeddings) que rompía el
  // RAG silenciosamente. El error se PROPAGA al caller para que la API
  // responda 500 — no tragar.
  try {
    await ds.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM activity_chunks WHERE activity_id = $1`,
        [activityId],
      );

      for (let i = 0; i < chunks.length; i++) {
        const vec = await embedDocumentWithRetry(chunks[i]);
        // Guard contra drift de dimensión del modelo de embeddings.
        // Si el vector no matchea EMBEDDING_DIM (e.g. cambió el modelo de
        // 384→768 sin migración), el INSERT contra `vector(384)` rompería
        // con un error críptico de pgvector. Este check explícito aborta
        // la transacción con rollback y un mensaje accionable.
        if (vec.length !== EMBEDDING_DIM) {
          throw new Error(
            `embedding dim mismatch: expected ${EMBEDDING_DIM}, got ${vec.length}`,
          );
        }
        await manager.query(
          `INSERT INTO activity_chunks (activity_id, chunk_index, chunk_text, embedding)
           VALUES ($1, $2, $3, $4::vector)`,
          [activityId, i, chunks[i], toVectorLiteral(vec)],
        );
        log.debug(`chunk ${i + 1}/${chunks.length} guardado`, { activityId });
      }
    });
  } catch (err) {
    endTotal();
    log.error("ingesta falló — rollback ejecutado", {
      activityId,
      error: String(err).slice(0, 300),
    });
    throw err;
  }

  endTotal();
  log.info("ingest done", {
    activityId,
    chunkCount: chunks.length,
    totalChars: text.length,
    embeddingDim: EMBEDDING_DIM,
    durationMs: Math.round(performance.now() - startTs),
  });
}
