import { getDataSource } from "@/db/data-source";
import type { Department } from "@/db/entities";
import { createLogger } from "@/lib/logger";

const log = createLogger("svc:places");

export type PlacePoint = { name: string; lat: number; lng: number };

// Internamente cacheamos también el slug para acelerar el matching contra
// las menciones del LLM (que pueden venir como name humano o casi-slug).
type CachedPoint = PlacePoint & { slug: string };

// Cache module-level: los departamentos no cambian dentro de la vida de un
// proceso. Una sola query en la primera invocación por proceso. Si el seed
// corre en caliente y agrega coords, hay que reiniciar dev — aceptable.
let cachedPoints: CachedPoint[] | null = null;
let cacheLoading: Promise<CachedPoint[]> | null = null;

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function loadPoints(): Promise<CachedPoint[]> {
  const ds = await getDataSource();
  const rows: Pick<Department, "name" | "slug" | "lat" | "lng">[] = await ds
    .getRepository<Department>("departments")
    .createQueryBuilder("d")
    .select(["d.name", "d.slug", "d.lat", "d.lng"])
    .where("d.lat IS NOT NULL AND d.lng IS NOT NULL")
    .getMany();

  // pg-node devuelve numeric como string. Casteamos a number para
  // que el consumer (Haversine en SQL) reciba números reales.
  const points: CachedPoint[] = rows
    .map((r) => ({
      name: r.name,
      slug: r.slug,
      lat: r.lat == null ? NaN : Number(r.lat),
      lng: r.lng == null ? NaN : Number(r.lng),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  log.info("departments con coords cargados", { count: points.length });
  return points;
}

async function getPoints(): Promise<CachedPoint[]> {
  if (cachedPoints) return cachedPoints;
  if (cacheLoading) return cacheLoading;
  cacheLoading = loadPoints().then((p) => {
    cachedPoints = p;
    cacheLoading = null;
    return p;
  });
  return cacheLoading;
}

/**
 * Resuelve un array de menciones de lugares (texto libre del LLM) a sus
 * coordenadas oficiales. Match contra `slug` y `name normalizado` del depto.
 * Lugares que no matchean ningún depto se omiten silenciosamente.
 */
export async function resolveMentionedPlaces(
  mentionedPlaces: string[],
): Promise<PlacePoint[]> {
  if (!mentionedPlaces || mentionedPlaces.length === 0) return [];

  const points = await getPoints();
  const byName = new Map<string, CachedPoint>();
  const bySlug = new Map<string, CachedPoint>();
  for (const p of points) {
    byName.set(normalize(p.name), p);
    bySlug.set(normalize(p.slug), p);
  }

  const matched: PlacePoint[] = [];
  const seen = new Set<string>();

  for (const raw of mentionedPlaces) {
    const norm = normalize(raw);
    if (!norm) continue;
    const hit =
      byName.get(norm) ??
      bySlug.get(norm) ??
      bySlug.get(norm.replace(/\s+/g, "-"));
    if (hit && !seen.has(hit.name)) {
      seen.add(hit.name);
      matched.push({ name: hit.name, lat: hit.lat, lng: hit.lng });
    }
  }

  log.info("resolveMentionedPlaces", {
    input: mentionedPlaces,
    resolved: matched.map((p) => p.name),
  });
  return matched;
}
