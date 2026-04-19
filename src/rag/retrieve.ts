import { getDataSource } from "@/db/data-source";
import { createLogger } from "@/lib/logger";
import { embedQuery, toVectorLiteral } from "./embeddings";

const log = createLogger("rag:retrieve");

export type ActivityHit = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  priceArs: string;
  startDate: Date;
  endDate: Date;
  bestChunk: string;
  distance: number;
};

export type RetrieveFilters = {
  maxPriceArs?: number;
  // Fecha exacta (ISO "YYYY-MM-DD"): la actividad debe tenerla en
  // `available_dates`. Usa el índice GIN con `= ANY(...)`.
  targetDate?: string;
  // Rango de fechas (ISO). Se exige overlap entre el rango y
  // `available_dates` — usa el operador `&&` de arrays Postgres.
  dateRangeStart?: string;
  dateRangeEnd?: string;
};

export async function retrieveActivities(
  query: string,
  topK = 5,
  filters: RetrieveFilters = {},
): Promise<ActivityHit[]> {
  log.info("búsqueda iniciada", { query, topK, filters });
  const ds = await getDataSource();
  const queryVec = toVectorLiteral(await embedQuery(query));

  const conditions: string[] = ["a.is_active = true"];
  const params: unknown[] = [queryVec];

  if (filters.maxPriceArs != null) {
    params.push(filters.maxPriceArs);
    conditions.push(`a.price_ars <= $${params.length}`);
  }
  if (filters.targetDate) {
    // La actividad tiene esa fecha en su array materializado.
    params.push(filters.targetDate);
    conditions.push(`$${params.length}::date = ANY(a.available_dates)`);
  } else if (filters.dateRangeStart && filters.dateRangeEnd) {
    // Overlap entre el rango pedido (expandido a array de dates) y las
    // available_dates de la actividad. GIN soporta `&&` directamente.
    params.push(filters.dateRangeStart);
    const idxStart = params.length;
    params.push(filters.dateRangeEnd);
    const idxEnd = params.length;
    conditions.push(
      `a.available_dates && ARRAY(SELECT generate_series($${idxStart}::date, $${idxEnd}::date, '1 day'::interval)::date)`,
    );
  }

  params.push(topK);
  const limitParamIdx = params.length;

  const endSql = log.time("sql retrieve");
  const rows = await ds.query(
    `
    WITH ranked AS (
      SELECT
        ac.activity_id,
        ac.chunk_text,
        ac.embedding <=> $1::vector AS distance,
        ROW_NUMBER() OVER (
          PARTITION BY ac.activity_id
          ORDER BY ac.embedding <=> $1::vector
        ) AS rn
      FROM activity_chunks ac
    )
    SELECT
      a.id,
      a.title,
      a.description,
      a.image_url AS "imageUrl",
      a.price_ars AS "priceArs",
      a.start_date AS "startDate",
      a.end_date AS "endDate",
      ranked.chunk_text AS "bestChunk",
      ranked.distance
    FROM ranked
    JOIN activities a ON a.id = ranked.activity_id
    WHERE ranked.rn = 1 AND ${conditions.join(" AND ")}
    ORDER BY ranked.distance
    LIMIT $${limitParamIdx}
    `,
    params,
  );
  endSql();

  log.info(`${rows.length} resultado(s)`, {
    topDistance: rows[0]?.distance,
  });
  return rows;
}
