/**
 * Seed `seed:la-rioja` — Fase 6 del plan de re-modelado.
 *
 * Importa las 110 actividades scrapeadas del sitio oficial de turismo de
 * La Rioja (`scraper/output/actividades.json`) más sus taxonomías
 * (`scraper/output/taxonomies.json`) al schema nuevo:
 *   - 18 departamentos oficiales (hard-codeados acá para garantizar consistencia)
 *   - clasificaciones del JSON del scraper
 *   - actividades con relaciones M:N + lat/lng + gallery
 *
 * Idempotente: usa `slug` (deps/clasif) y `sourceSlug` (activities) como
 * clave de upsert. Re-correr el seed no duplica nada.
 *
 * Después de cada activity guardada se dispara `ingestActivity` para
 * regenerar chunks + embeddings con el texto enriquecido (que ya incluye
 * Categorías + Departamento desde Fase 5).
 *
 * Uso: `npm run seed:la-rioja`
 */

import "reflect-metadata";
// Cargamos .env y .env.local antes de importar cualquier módulo que lea env.
// Next.js hace esto automáticamente; ts-node no.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AppDataSource, getDataSource } from "@/db/data-source";
import type {
  Activity,
  Classification,
  Department,
} from "@/db/entities";
import { createLogger } from "@/lib/logger";
import { ingestActivity } from "@/rag";

import { localizeImage } from "./lib/localize-image";

const log = createLogger("seed:la-rioja");

// ─── Stats globales de descarga de imágenes ─────────────────────────────
const imageStats = {
  downloaded: 0,
  cached: 0,
  failed: 0,
};

/**
 * Wrapper local: intenta localizar una URL externa. Si falla (timeout, 404,
 * tipo no permitido, archivo demasiado grande), loguea `warn` y devuelve la
 * URL original — el demo sigue funcionando con la URL externa.
 */
async function tryLocalize(externalUrl: string): Promise<string> {
  try {
    const { url, localized } = await localizeImage(externalUrl);
    if (localized) {
      imageStats.downloaded++;
    } else {
      imageStats.cached++;
    }
    return url;
  } catch (err) {
    imageStats.failed++;
    log.warn("descarga falló — manteniendo URL externa", {
      url: externalUrl,
      error: err instanceof Error ? err.message : String(err),
    });
    return externalUrl;
  }
}

// ─── Paths ──────────────────────────────────────────────────────────────
const SCRAPER_DIR = join(process.cwd(), "scraper", "output");
const TAXONOMIES_FILE = join(SCRAPER_DIR, "taxonomies.json");
const ACTIVIDADES_FILE = join(SCRAPER_DIR, "actividades.json");

// ─── Tipos del scraper (mirror de scraper/schema.ts, sólo lo que usamos) ─
interface ScrapedTerm {
  id: number;
  name: string;
  slug: string;
  count: number;
}

interface ScrapedCoords {
  lat: number;
  lng: number;
  source: string;
}

interface ScrapedGalleryImage {
  full: string | null;
  thumb: string | null;
  caption: string | null;
}

interface ScrapedMapsLink {
  original: string;
  resolved: string;
}

interface ScrapedActividad {
  slug: string;
  title: string;
  descriptionText: string;
  descriptionHtml: string;
  clasificaciones: ScrapedTerm[];
  departamentos: ScrapedTerm[];
  coords: ScrapedCoords | null;
  gallery: ScrapedGalleryImage[];
  mapsLinks: ScrapedMapsLink[];
}

interface TaxonomiesFile {
  clasificaciones: Record<string, ScrapedTerm>;
  departamentos: Record<string, ScrapedTerm>;
  region: Record<string, ScrapedTerm>;
}

// ─── 18 departamentos oficiales de La Rioja (Argentina) ─────────────────
// Slugs alineados con los del scraper para que el matching activity → dept
// funcione directo (ver `departamentos[].slug` en taxonomies.json).
// lat/lng son aproximadas a la cabecera departamental (Wikipedia / IGN AR).
// El upsert por slug actualiza también lat/lng — re-correr el seed es
// idempotente.
const OFFICIAL_DEPARTMENTS: {
  name: string;
  slug: string;
  lat: number;
  lng: number;
}[] = [
  { name: "Capital", slug: "larioja-capital", lat: -29.4131, lng: -66.8556 },
  { name: "Arauco", slug: "arauco", lat: -28.5667, lng: -66.6167 },
  { name: "Castro Barros", slug: "castro-barros", lat: -28.9886, lng: -66.7783 },
  { name: "Chamical", slug: "chamical", lat: -30.3608, lng: -66.3133 },
  { name: "Chilecito", slug: "chilecito", lat: -29.1644, lng: -67.5004 },
  { name: "Coronel Felipe Varela", slug: "gral-felipe-varela", lat: -28.5333, lng: -68.4167 },
  { name: "Famatina", slug: "famatina", lat: -28.9282, lng: -67.5210 },
  { name: "General Ángel V. Peñaloza", slug: "angel-vicente-penaloza", lat: -31.1300, lng: -66.7700 },
  { name: "General Belgrano", slug: "gral-belgrano", lat: -30.7833, lng: -66.0833 },
  { name: "General Juan Facundo Quiroga", slug: "gral-juan-facundo-quiroga", lat: -30.4500, lng: -65.8167 },
  { name: "General Lamadrid", slug: "gral-lamadrid", lat: -28.1667, lng: -68.7000 },
  { name: "General Ortiz de Ocampo", slug: "gral-ocampo", lat: -30.6833, lng: -66.7667 },
  { name: "General San Martín", slug: "gral-san-martin", lat: -30.7333, lng: -65.7000 },
  { name: "Independencia", slug: "independencia", lat: -30.0667, lng: -67.0833 },
  { name: "Rosario Vera Peñaloza", slug: "rosario-v-penaloza", lat: -30.9667, lng: -66.7000 },
  { name: "San Blas de Los Sauces", slug: "san-blas-de-los-sauces", lat: -28.7333, lng: -67.0667 },
  { name: "Sanagasta", slug: "sanagasta", lat: -29.2833, lng: -67.0167 },
  { name: "Vinchina", slug: "vinchina", lat: -28.7667, lng: -68.1833 },
];

// ─── Resumen final ──────────────────────────────────────────────────────
interface SeedSummary {
  departmentsUpserted: number;
  classificationsUpserted: number;
  activitiesUpserted: number;
  activitiesFailed: number;
  imagesDownloaded: number;
  imagesCached: number;
  imagesFailed: number;
  failures: { slug: string; error: string }[];
}

// ─── Pasos ──────────────────────────────────────────────────────────────

async function seedDepartments(): Promise<number> {
  log.info("seedDepartments — iniciando", { total: OFFICIAL_DEPARTMENTS.length });
  const ds = await getDataSource();
  const repo = ds.getRepository<Department>("departments");

  let upserted = 0;
  for (const { name, slug, lat, lng } of OFFICIAL_DEPARTMENTS) {
    const existing = await repo.findOne({ where: { slug } });
    if (existing) {
      // pg-node devuelve numeric como string — comparamos como number para
      // detectar drift real y evitar saves inútiles.
      const existingLat =
        existing.lat == null ? null : Number(existing.lat);
      const existingLng =
        existing.lng == null ? null : Number(existing.lng);
      const changed =
        existing.name !== name ||
        existingLat !== lat ||
        existingLng !== lng;
      if (changed) {
        existing.name = name;
        existing.lat = lat;
        existing.lng = lng;
        await repo.save(existing);
        log.debug("dept actualizado", { slug, name, lat, lng });
      }
    } else {
      const created = repo.create({ name, slug, lat, lng });
      await repo.save(created);
      log.debug("dept creado", { slug, name, lat, lng });
    }
    upserted++;
  }

  log.info("seedDepartments — listo", { upserted });
  return upserted;
}

async function seedClassifications(tax: TaxonomiesFile): Promise<number> {
  const entries = Object.values(tax.clasificaciones);
  log.info("seedClassifications — iniciando", { total: entries.length });

  const ds = await getDataSource();
  const repo = ds.getRepository<Classification>("classifications");

  let upserted = 0;
  for (const term of entries) {
    const existing = await repo.findOne({ where: { slug: term.slug } });
    if (existing) {
      if (existing.name !== term.name) {
        existing.name = term.name;
        await repo.save(existing);
        log.debug("classif name actualizado", { slug: term.slug, name: term.name });
      }
    } else {
      const created = repo.create({ name: term.name, slug: term.slug });
      await repo.save(created);
      log.debug("classif creado", { slug: term.slug, name: term.name });
    }
    upserted++;
  }

  log.info("seedClassifications — listo", { upserted });
  return upserted;
}

async function loadTaxonomyMaps(): Promise<{
  deptBySlug: Map<string, Department>;
  classifBySlug: Map<string, Classification>;
}> {
  const ds = await getDataSource();
  const depts = await ds.getRepository<Department>("departments").find();
  const classifs = await ds.getRepository<Classification>("classifications").find();
  return {
    deptBySlug: new Map(depts.map((d) => [d.slug, d])),
    classifBySlug: new Map(classifs.map((c) => [c.slug, c])),
  };
}

async function seedActivities(
  actividades: ScrapedActividad[],
  deptBySlug: Map<string, Department>,
  classifBySlug: Map<string, Classification>,
): Promise<{ upserted: number; failures: { slug: string; error: string }[] }> {
  log.info("seedActivities — iniciando", { total: actividades.length });

  const ds = await getDataSource();
  const repo = ds.getRepository<Activity>("activities");

  // Defaults para campos no presentes en el scraper.
  const now = new Date();
  const yearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const failures: { slug: string; error: string }[] = [];
  let upserted = 0;

  for (let i = 0; i < actividades.length; i++) {
    const src = actividades[i];
    const progress = `${i + 1}/${actividades.length}`;

    try {
      // ── Resolver relaciones ────────────────────────────────────────
      const departments: Department[] = [];
      for (const d of src.departamentos) {
        const match = deptBySlug.get(d.slug);
        if (match) {
          departments.push(match);
        } else {
          log.warn("dept del scraper no matchea ningún dept oficial", {
            scrapedSlug: d.slug,
            scrapedName: d.name,
            activitySlug: src.slug,
          });
        }
      }

      const classifications: Classification[] = [];
      for (const c of src.clasificaciones) {
        const match = classifBySlug.get(c.slug);
        if (match) {
          classifications.push(match);
        } else {
          log.warn("classif del scraper no matchea catálogo", {
            scrapedSlug: c.slug,
            scrapedName: c.name,
            activitySlug: src.slug,
          });
        }
      }

      // ── Mapear scraper → DB (defaults para lo que no viene) ───────
      const firstGallery = src.gallery?.[0];

      // ── Localizar imágenes externas a public/uploads/scraped/ ──────
      // Las descargas dentro de UNA activity corren en paralelo (Promise.all);
      // las activities siguen procesándose secuencialmente. La idempotencia
      // por hash de URL hace dedupe gratis si full === thumb o si imageUrl
      // coincide con gallery[0].full.
      const imageUrlSeed = firstGallery?.full ?? null;
      const [localizedImageUrl, localizedGallery] = await Promise.all([
        imageUrlSeed ? tryLocalize(imageUrlSeed) : Promise.resolve(null),
        Promise.all(
          (src.gallery ?? []).map(async (g) => ({
            full: g.full ? await tryLocalize(g.full) : null,
            thumb: g.thumb ? await tryLocalize(g.thumb) : null,
            caption: g.caption,
          })),
        ),
      ]);

      const data = {
        title: src.title,
        description: src.descriptionText,
        imageUrl: localizedImageUrl,
        startDate: now,
        endDate: yearFromNow,
        requirements: "A definir",
        physicalPrep: "A definir",
        altitudeM: null as number | null,
        elevationGainM: null as number | null,
        priceArs: "0",
        isActive: true,
        recurrence: null,
        availableDates: [] as string[],
        audienceTags: [] as string[],
        lat: src.coords?.lat ?? null,
        lng: src.coords?.lng ?? null,
        gallery: localizedGallery,
        sourceSlug: src.slug,
      };

      // ── Upsert por sourceSlug ──────────────────────────────────────
      const existing = await repo.findOne({
        where: { sourceSlug: src.slug },
        relations: ["departments", "classifications"],
      });

      let saved: Activity;
      if (existing) {
        Object.assign(existing, data);
        existing.departments = departments;
        existing.classifications = classifications;
        saved = await repo.save(existing);
      } else {
        const entity = repo.create(data);
        entity.departments = departments;
        entity.classifications = classifications;
        saved = await repo.save(entity);
      }

      // Recargar con relaciones para que ingestActivity vea los nombres
      // de tax que se concatenan al texto embebido (ver §5.1 del plan).
      const fresh = await repo.findOneOrFail({
        where: { id: saved.id },
        relations: ["departments", "classifications"],
      });

      await ingestActivity(saved.id, fresh);

      upserted++;
      if (upserted % 10 === 0 || upserted === actividades.length) {
        log.info(`seeded ${upserted}/${actividades.length} activities`);
      } else {
        log.debug(`activity ${progress} ok`, { slug: src.slug, id: saved.id });
      }
    } catch (err) {
      const errStr = err instanceof Error ? err.message : String(err);
      log.error(`fallo activity ${progress}`, {
        slug: src.slug,
        title: src.title,
        error: errStr,
      });
      failures.push({ slug: src.slug, error: errStr });
    }
  }

  log.info("seedActivities — listo", { upserted, failed: failures.length });
  return { upserted, failures };
}

async function main() {
  log.info("=== seed:la-rioja iniciado ===");
  const endTotal = log.time("seed:la-rioja completo");

  // Leer fuentes antes de tocar la DB para fallar rápido si no existen.
  const tax: TaxonomiesFile = JSON.parse(
    readFileSync(TAXONOMIES_FILE, "utf-8"),
  );
  const actividades: ScrapedActividad[] = JSON.parse(
    readFileSync(ACTIVIDADES_FILE, "utf-8"),
  );
  log.info("fuentes leídas", {
    classificacionesEnJSON: Object.keys(tax.clasificaciones).length,
    activitiesEnJSON: actividades.length,
  });

  // Fuerza initialize() del DataSource (y aplica migraciones pendientes).
  await getDataSource();

  const summary: SeedSummary = {
    departmentsUpserted: 0,
    classificationsUpserted: 0,
    activitiesUpserted: 0,
    activitiesFailed: 0,
    imagesDownloaded: 0,
    imagesCached: 0,
    imagesFailed: 0,
    failures: [],
  };

  try {
    summary.departmentsUpserted = await seedDepartments();
    summary.classificationsUpserted = await seedClassifications(tax);
    const { deptBySlug, classifBySlug } = await loadTaxonomyMaps();
    const { upserted, failures } = await seedActivities(
      actividades,
      deptBySlug,
      classifBySlug,
    );
    summary.activitiesUpserted = upserted;
    summary.activitiesFailed = failures.length;
    summary.failures = failures;
  } finally {
    summary.imagesDownloaded = imageStats.downloaded;
    summary.imagesCached = imageStats.cached;
    summary.imagesFailed = imageStats.failed;
    endTotal();
  }

  log.info("=== seed:la-rioja terminado ===", {
    departmentsUpserted: summary.departmentsUpserted,
    classificationsUpserted: summary.classificationsUpserted,
    activitiesUpserted: summary.activitiesUpserted,
    activitiesFailed: summary.activitiesFailed,
    imagesDownloaded: summary.imagesDownloaded,
    imagesCached: summary.imagesCached,
    imagesFailed: summary.imagesFailed,
  });

  // Resumen visible en consola para el operador.
  // Excepción permitida en scripts/ (ver skill logging §Don't).
  // eslint-disable-next-line no-console
  console.log("\n──────────── RESUMEN seed:la-rioja ────────────");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
  // eslint-disable-next-line no-console
  console.log("───────────────────────────────────────────────\n");
}

main()
  .then(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    process.exit(0);
  })
  .catch(async (err) => {
    log.error("fatal en seed:la-rioja", { error: String(err) });
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    process.exit(1);
  });
