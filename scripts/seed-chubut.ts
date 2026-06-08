/**
 * Seed `seed:chubut` — fork de seed-la-rioja.ts adaptado a Chubut.
 *
 * Importa las experiencias scrapeadas del sitio oficial de turismo de Chubut
 * (`scraper/output-chubut/actividades.json`) más sus taxonomías
 * (`scraper/output-chubut/taxonomies.json`) al schema:
 *   - 16 departamentos oficiales de Chubut (hard-codeados acá, mismo patrón
 *     que el seed La Rioja para garantizar consistencia).
 *   - clasificaciones del JSON del scraper (tipo + público + temporada).
 *   - actividades con relaciones M:N + lat/lng (centroide del depto resuelto)
 *     + gallery filtrada (sin season icons).
 *
 * Idempotente: usa `slug` (deps/clasif) y `sourceSlug` (activities) como
 * clave de upsert.
 *
 * Uso: `npm run seed:chubut`
 */

import "reflect-metadata";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AppDataSource, getDataSource } from "@/db/data-source";
import type { Activity, Classification, Department } from "@/db/entities";
import { createLogger } from "@/lib/logger";
import { ingestActivity } from "@/rag";

import { localizeImage } from "./lib/localize-image";

const log = createLogger("seed:chubut");

const imageStats = { downloaded: 0, cached: 0, failed: 0 };

async function tryLocalize(externalUrl: string): Promise<string> {
  try {
    const { url, localized } = await localizeImage(externalUrl);
    if (localized) imageStats.downloaded++;
    else imageStats.cached++;
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
const SCRAPER_DIR = join(process.cwd(), "scraper", "output-chubut");
const TAXONOMIES_FILE = join(SCRAPER_DIR, "taxonomies.json");
const ACTIVIDADES_FILE = join(SCRAPER_DIR, "actividades.json");

// ─── Tipos del scraper Chubut (mirror de schema-chubut.ts) ──────────────
interface ScrapedTerm {
  id: number;
  name: string;
  slug: string;
  count: number;
}

interface ScrapedGalleryImage {
  full: string | null;
  thumb: string | null;
  caption: string | null;
}

interface ScrapedExperiencia {
  slug: string;
  link: string;
  title: string;
  descriptionText: string;
  descriptionHtml: string;
  seasonalTags: string[];
  audienceTags: string[];
  typeTags: string[];
  locationCandidates: string[];
  gallery: ScrapedGalleryImage[];
  heroImages: string[];
  coords: null;
  error?: string;
}

interface TaxonomiesFile {
  clasificaciones: Record<string, ScrapedTerm>;
  departamentos: Record<string, ScrapedTerm>;
  region: Record<string, ScrapedTerm>;
}

// ─── 16 departamentos oficiales de Chubut (Argentina) ───────────────────
// Slugs en kebab-case sin tildes. lat/lng aproximadas a la cabecera
// departamental (Wikipedia / IGN AR).
const OFFICIAL_DEPARTMENTS: {
  name: string;
  slug: string;
  lat: number;
  lng: number;
}[] = [
  { name: "Biedma", slug: "biedma", lat: -42.7692, lng: -65.0383 }, // Puerto Madryn
  { name: "Cushamen", slug: "cushamen", lat: -42.1833, lng: -71.2167 }, // El Maitén
  { name: "Escalante", slug: "escalante", lat: -45.8667, lng: -67.5 }, // Comodoro Rivadavia
  { name: "Florentino Ameghino", slug: "florentino-ameghino", lat: -44.05, lng: -66.5 }, // Camarones
  { name: "Futaleufú", slug: "futaleufu", lat: -42.9111, lng: -71.3194 }, // Esquel
  { name: "Gaiman", slug: "gaiman", lat: -43.2833, lng: -65.4833 }, // Gaiman
  { name: "Gastre", slug: "gastre", lat: -42.2667, lng: -69.2167 }, // Gastre
  { name: "Languiñeo", slug: "languineo", lat: -43.6833, lng: -70.5167 }, // Tecka
  { name: "Mártires", slug: "martires", lat: -43.1, lng: -68.3 }, // Las Plumas
  { name: "Paso de Indios", slug: "paso-de-indios", lat: -43.8667, lng: -69.05 },
  { name: "Rawson", slug: "rawson", lat: -43.3, lng: -65.1019 }, // Rawson
  { name: "Río Senguer", slug: "rio-senguer", lat: -45.0333, lng: -70.8167 }, // Alto Río Senguer
  { name: "Sarmiento", slug: "sarmiento", lat: -45.5833, lng: -69.0667 }, // Sarmiento
  { name: "Tehuelches", slug: "tehuelches", lat: -43.8833, lng: -70.7167 }, // José de San Martín
  { name: "Telsen", slug: "telsen", lat: -42.4167, lng: -66.95 }, // Telsen
  { name: "Trevelin", slug: "trevelin", lat: -43.0833, lng: -71.4667 }, // Trevelin
];

// Alias: nombre/ciudad que aparece en el HTML → slug del depto al que pertenece.
// Cubre cabeceras + ciudades importantes que NO son cabecera pero figuran como
// referencia geográfica en las experiencias. Match case-insensitive.
const LOCATION_ALIAS_TO_DEPT: Record<string, string> = {
  "puerto madryn": "biedma",
  "puerto pirámides": "biedma",
  "puerto piramides": "biedma",
  "península valdés": "biedma",
  "peninsula valdes": "biedma",
  "el maitén": "cushamen",
  "el maiten": "cushamen",
  "el hoyo": "cushamen",
  epuyén: "cushamen",
  epuyen: "cushamen",
  "lago puelo": "cushamen",
  "comodoro rivadavia": "escalante",
  "rada tilly": "escalante",
  camarones: "florentino-ameghino",
  "cabo dos bahías": "florentino-ameghino",
  "cabo dos bahias": "florentino-ameghino",
  esquel: "futaleufu",
  "los alerces": "futaleufu",
  "la hoya": "futaleufu",
  gaiman: "gaiman",
  dolavon: "gaiman",
  "veintiocho de julio": "gaiman",
  "28 de julio": "gaiman",
  gastre: "gastre",
  tecka: "languineo",
  "las plumas": "martires",
  "paso de indios": "paso-de-indios",
  rawson: "rawson",
  trelew: "rawson",
  "playa unión": "rawson",
  "playa union": "rawson",
  "alto río senguer": "rio-senguer",
  "alto rio senguer": "rio-senguer",
  sarmiento: "sarmiento",
  "bosque petrificado": "sarmiento",
  "josé de san martín": "tehuelches",
  "jose de san martin": "tehuelches",
  telsen: "telsen",
  trevelin: "trevelin",
};

/**
 * Resuelve la lista de location candidates del scraper a un set de departments.
 * Una experiencia puede asociarse a varios departamentos si menciona ciudades
 * de distintos deptos (típico en circuitos turísticos).
 */
function resolveDepartments(
  candidates: string[],
  deptBySlug: Map<string, Department>,
): Department[] {
  const matchedSlugs = new Set<string>();
  for (const c of candidates) {
    const lower = c.toLowerCase().replace(/\s+/g, " ").trim();
    // Match exacto del alias
    const aliasMatch = LOCATION_ALIAS_TO_DEPT[lower];
    if (aliasMatch) {
      matchedSlugs.add(aliasMatch);
      continue;
    }
    // Match contra cualquier alias contenido en el candidato (sustring)
    for (const [alias, deptSlug] of Object.entries(LOCATION_ALIAS_TO_DEPT)) {
      if (lower.includes(alias)) {
        matchedSlugs.add(deptSlug);
        break;
      }
    }
  }
  const result: Department[] = [];
  for (const slug of matchedSlugs) {
    const d = deptBySlug.get(slug);
    if (d) result.push(d);
  }
  return result;
}

// ─── Filtros sobre el gallery del scraper ───────────────────────────────
// El scraper recoge TODAS las <img> bajo el container principal; en Chubut
// eso incluye los íconos de temporada (invierno.png, primavera.png, etc.) y
// el icono "term-custom-icon". Los descartamos acá para no contaminar la
// galería ni el hero de cada actividad.
const SEASON_ICON_PATTERN =
  /(invierno|primavera|verano|otono|otono)\.png$/i;
function isUsableGalleryImage(img: ScrapedGalleryImage): boolean {
  if (!img.full) return false;
  if (SEASON_ICON_PATTERN.test(img.full)) return false;
  if (img.caption && img.caption.toLowerCase().includes("term-custom-icon"))
    return false;
  return true;
}

async function seedDepartments(): Promise<number> {
  log.info("seedDepartments — iniciando", {
    total: OFFICIAL_DEPARTMENTS.length,
  });
  const ds = await getDataSource();
  const repo = ds.getRepository<Department>("departments");

  let upserted = 0;
  for (const { name, slug, lat, lng } of OFFICIAL_DEPARTMENTS) {
    const existing = await repo.findOne({ where: { slug } });
    if (existing) {
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
        log.debug("classif name actualizado", {
          slug: term.slug,
          name: term.name,
        });
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
  const classifs = await ds
    .getRepository<Classification>("classifications")
    .find();
  return {
    deptBySlug: new Map(depts.map((d) => [d.slug, d])),
    classifBySlug: new Map(classifs.map((c) => [c.slug, c])),
  };
}

function slugifyTerm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Mapea los tags textuales que el scraper extrae por experiencia
 * (seasonalTags + audienceTags + typeTags) a los slugs que el seed cargó
 * en la tabla classifications. Mantiene los mismos prefixes que el scraper
 * usó al construir taxonomies.json: temporada-X, publico-Y, sin prefix para
 * tipos. Devuelve los slugs candidatos para hacer lookup en classifBySlug.
 */
function buildClassificationSlugs(src: ScrapedExperiencia): string[] {
  const slugs = new Set<string>();
  for (const t of src.typeTags) slugs.add(slugifyTerm(t));
  for (const a of src.audienceTags) slugs.add(`publico-${slugifyTerm(a)}`);
  for (const s of src.seasonalTags) slugs.add(`temporada-${slugifyTerm(s)}`);
  return [...slugs];
}

async function seedActivities(
  experiencias: ScrapedExperiencia[],
  deptBySlug: Map<string, Department>,
  classifBySlug: Map<string, Classification>,
): Promise<{ upserted: number; failures: { slug: string; error: string }[] }> {
  log.info("seedActivities — iniciando", { total: experiencias.length });

  const ds = await getDataSource();
  const repo = ds.getRepository<Activity>("activities");

  const now = new Date();
  const yearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const failures: { slug: string; error: string }[] = [];
  let upserted = 0;

  for (let i = 0; i < experiencias.length; i++) {
    const src = experiencias[i];
    const progress = `${i + 1}/${experiencias.length}`;

    if (src.error) {
      log.warn(`skip ${progress} — scraper error`, {
        slug: src.slug,
        error: src.error,
      });
      failures.push({ slug: src.slug, error: src.error });
      continue;
    }

    try {
      // ── Resolver relaciones ────────────────────────────────────────
      const departments = resolveDepartments(
        src.locationCandidates,
        deptBySlug,
      );
      if (departments.length === 0) {
        log.warn("ninguna location candidate matchea departamento oficial", {
          slug: src.slug,
          candidates: src.locationCandidates.slice(0, 6),
        });
      }

      const classifSlugs = buildClassificationSlugs(src);
      const classifications: Classification[] = [];
      for (const cs of classifSlugs) {
        const match = classifBySlug.get(cs);
        if (match) classifications.push(match);
        else
          log.debug("classif no presente en catálogo", {
            slug: cs,
            activitySlug: src.slug,
          });
      }

      // ── Filtrar gallery (descartar season icons + term-custom-icon) ──
      const filteredGallery = (src.gallery ?? []).filter(isUsableGalleryImage);

      // ── Hero: preferimos heroImages[0] (real photo) sobre gallery[0]
      // (que en Chubut suele ser un season icon que ya filtramos arriba).
      const heroCandidate =
        src.heroImages?.find(
          (u) => !!u && !SEASON_ICON_PATTERN.test(u),
        ) ?? filteredGallery[0]?.full ?? null;

      // ── Localizar imágenes externas a public/uploads/scraped/ ─────
      const [localizedImageUrl, localizedGallery] = await Promise.all([
        heroCandidate ? tryLocalize(heroCandidate) : Promise.resolve(null),
        Promise.all(
          filteredGallery.map(async (g) => ({
            full: g.full ? await tryLocalize(g.full) : null,
            thumb: g.thumb ? await tryLocalize(g.thumb) : null,
            caption: g.caption,
          })),
        ),
      ]);

      // ── Coordenadas: Chubut no las trae del HTML. Usamos el centroide
      // del primer departamento resuelto como fallback para que el
      // MiniMap y los filtros geo del retrieval sigan funcionando.
      const firstDept = departments[0];
      const lat =
        firstDept?.lat != null ? Number(firstDept.lat) : null;
      const lng =
        firstDept?.lng != null ? Number(firstDept.lng) : null;

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
        lat,
        lng,
        gallery: localizedGallery,
        sourceSlug: src.slug,
      };

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

      const fresh = await repo.findOneOrFail({
        where: { id: saved.id },
        relations: ["departments", "classifications"],
      });

      await ingestActivity(saved.id, fresh);

      upserted++;
      if (upserted % 10 === 0 || upserted === experiencias.length) {
        log.info(`seeded ${upserted}/${experiencias.length} activities`);
      } else {
        log.debug(`activity ${progress} ok`, {
          slug: src.slug,
          id: saved.id,
          depts: departments.length,
          classifs: classifications.length,
        });
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

  log.info("seedActivities — listo", {
    upserted,
    failed: failures.length,
  });
  return { upserted, failures };
}

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

async function main() {
  log.info("=== seed:chubut iniciado ===");
  const endTotal = log.time("seed:chubut completo");

  const tax: TaxonomiesFile = JSON.parse(
    readFileSync(TAXONOMIES_FILE, "utf-8"),
  );
  const experiencias: ScrapedExperiencia[] = JSON.parse(
    readFileSync(ACTIVIDADES_FILE, "utf-8"),
  );
  log.info("fuentes leídas", {
    classificacionesEnJSON: Object.keys(tax.clasificaciones).length,
    experienciasEnJSON: experiencias.length,
  });

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
      experiencias,
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

  log.info("=== seed:chubut terminado ===", {
    departmentsUpserted: summary.departmentsUpserted,
    classificationsUpserted: summary.classificationsUpserted,
    activitiesUpserted: summary.activitiesUpserted,
    activitiesFailed: summary.activitiesFailed,
    imagesDownloaded: summary.imagesDownloaded,
    imagesCached: summary.imagesCached,
    imagesFailed: summary.imagesFailed,
  });

  // eslint-disable-next-line no-console
  console.log("\n──────────── RESUMEN seed:chubut ────────────");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
  // eslint-disable-next-line no-console
  console.log("─────────────────────────────────────────────\n");
}

main()
  .then(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    process.exit(0);
  })
  .catch(async (err) => {
    log.error("fatal en seed:chubut", { error: String(err) });
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    process.exit(1);
  });
