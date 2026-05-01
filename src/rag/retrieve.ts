import { getDataSource } from "@/db/data-source";
import type { GalleryImage } from "@/db/entities/Activity";
import { createLogger } from "@/lib/logger";
import { embedQuery, toVectorLiteral } from "./embeddings";

const log = createLogger("rag:retrieve");

// Hard cosine-distance threshold para descartar hits semánticamente lejanos.
// pgvector cosine distance: 0 = idéntico, 1 = ortogonal, 2 = opuesto.
// 0.85 es marginal-pobre — deja pasar matches mediocres que el evaluator
// puede aún rescatar, pero filtra basura (preguntas off-topic que el guard
// dejó pasar pero que no tienen ningún match razonable en el catálogo).
const MAX_VECTOR_DISTANCE = 0.85;

export type TaxonomyRef = { name: string; slug: string };

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
  // Campos nuevos de Fase 2 que viajan junto al hit. Departments y
  // classifications son matching semántico en el embedding (no filtros WHERE);
  // los devolvemos acá solo para que la UI pueda renderizarlos como chips.
  lat: number | null;
  lng: number | null;
  gallery: GalleryImage[];
  departments: TaxonomyRef[];
  classifications: TaxonomyRef[];
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
  // Constraints duros sobre altitud / desnivel. Se aplican SOLO cuando el
  // usuario menciona NÚMEROS EXPLÍCITOS ("sobre 4000m", "menos de 1000m",
  // "desnivel hasta 500m"). Frases cualitativas como "alta montaña" o "muy
  // exigente" NO se traducen a estos filtros — se resuelven vía embedding
  // contra los audienceTags derivados (ver lib/services/difficulty-tags.ts).
  minAltitudeM?: number;
  maxAltitudeM?: number;
  minElevationGainM?: number;
  maxElevationGainM?: number;
  // Filtro geográfico: la actividad debe estar a ≤ maxDistanceKm de
  // CUALQUIERA de los puntos pasados (OR semántico para multi-place).
  // Las activities sin lat/lng quedan excluidas cuando este filtro está set.
  // maxDistanceKm default = 100 cuando nearPoints está set y no se pasa.
  nearPoints?: Array<{ lat: number; lng: number }>;
  maxDistanceKm?: number;
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

  // Filtros numéricos sobre altitud/desnivel — solo cuando el usuario menciona
  // valores explícitos en su mensaje (ver extractIntent). Cualquier valor null
  // en a.altitude_m / a.elevation_gain_m queda EXCLUIDO cuando hay filtro
  // (semántica de constraint duro). Esto es correcto: si el usuario pide
  // "sobre 4000m" no queremos devolver actividades sin esa info cargada.
  if (filters.minAltitudeM != null) {
    params.push(filters.minAltitudeM);
    conditions.push(`a.altitude_m >= $${params.length}::int`);
  }
  if (filters.maxAltitudeM != null) {
    params.push(filters.maxAltitudeM);
    conditions.push(`a.altitude_m <= $${params.length}::int`);
  }
  if (filters.minElevationGainM != null) {
    params.push(filters.minElevationGainM);
    conditions.push(`a.elevation_gain_m >= $${params.length}::int`);
  }
  if (filters.maxElevationGainM != null) {
    params.push(filters.maxElevationGainM);
    conditions.push(`a.elevation_gain_m <= $${params.length}::int`);
  }

  // Filtro geográfico Haversine. unnest paralelo desde Postgres 9.4: la
  // tabla derivada p(plat, plng) recorre los puntos índice-a-índice; el
  // EXISTS es true si la activity está dentro del radio de AL MENOS uno.
  // 6371 km es el radio medio de la Tierra; 2 * asin(sqrt(...)) calcula
  // el ángulo central con la fórmula clásica del semiverseno.
  if (filters.nearPoints && filters.nearPoints.length > 0) {
    const lats = filters.nearPoints.map((p) => p.lat);
    const lngs = filters.nearPoints.map((p) => p.lng);
    const maxKm = filters.maxDistanceKm ?? 100;
    params.push(lats);
    const idxLats = params.length;
    params.push(lngs);
    const idxLngs = params.length;
    params.push(maxKm);
    const idxMaxKm = params.length;
    conditions.push(
      `a.lat IS NOT NULL
        AND a.lng IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM unnest($${idxLats}::numeric[], $${idxLngs}::numeric[]) AS p(plat, plng)
          WHERE 6371 * 2 * asin(sqrt(
            power(sin(radians((p.plat - a.lat) / 2)), 2) +
            cos(radians(a.lat)) * cos(radians(p.plat)) *
            power(sin(radians((p.plng - a.lng) / 2)), 2)
          )) <= $${idxMaxKm}
        )`,
    );
  }

  params.push(MAX_VECTOR_DISTANCE);
  const maxDistParamIdx = params.length;

  params.push(topK);
  const limitParamIdx = params.length;

  const endSql = log.time("sql retrieve");
  // Sub-SELECTs con COALESCE para departments/classifications: si la activity
  // no tiene tags asignados queremos `[]`, no `null`. JSON arrays embebidos
  // ahorran un round-trip — todo viene en una sola query.
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
      a.lat,
      a.lng,
      a.gallery,
      ranked.chunk_text AS "bestChunk",
      ranked.distance,
      COALESCE((
        SELECT json_agg(json_build_object('name', d.name, 'slug', d.slug) ORDER BY d.name)
        FROM activity_departments ad
        JOIN departments d ON d.id = ad.department_id
        WHERE ad.activity_id = a.id
      ), '[]'::json) AS departments,
      COALESCE((
        SELECT json_agg(json_build_object('name', c.name, 'slug', c.slug) ORDER BY c.name)
        FROM activity_classifications ac2
        JOIN classifications c ON c.id = ac2.classification_id
        WHERE ac2.activity_id = a.id
      ), '[]'::json) AS classifications
    FROM ranked
    JOIN activities a ON a.id = ranked.activity_id
    WHERE ranked.rn = 1
      AND ranked.distance < $${maxDistParamIdx}
      AND ${conditions.join(" AND ")}
    ORDER BY ranked.distance
    LIMIT $${limitParamIdx}
    `,
    params,
  );
  endSql();

  // Postgres devuelve `lat`/`lng` como string (numeric) y json como objeto ya
  // parseado. Normalizamos lat/lng a number para que el tipo cierre.
  const hits: ActivityHit[] = rows.map((r: ActivityHit & { lat: string | number | null; lng: string | number | null }) => ({
    ...r,
    lat: r.lat == null ? null : Number(r.lat),
    lng: r.lng == null ? null : Number(r.lng),
  }));

  if (hits.length === 0) {
    // Probable causa: todos los chunks quedaron por encima de
    // MAX_VECTOR_DISTANCE — la query no tiene match razonable en el
    // catálogo. Logueamos como warn para detectar drift / preguntas
    // que pasaron el input_guard pero no tienen catálogo asociado.
    log.warn("0 hits tras MAX_VECTOR_DISTANCE filter", {
      maxVectorDistance: MAX_VECTOR_DISTANCE,
      query: query.slice(0, 120),
    });
  }

  log.info(`${hits.length} resultado(s)`, {
    topDistance: hits[0]?.distance,
  });
  return hits;
}
