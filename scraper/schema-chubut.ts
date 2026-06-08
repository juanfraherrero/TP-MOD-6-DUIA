/**
 * Schema de cada experiencia scrapeada desde chubutpatagonia.gob.ar.
 * Archivo generado a partir de output-chubut/actividades.json.
 *
 * El sitio NO expone custom post types vía WP REST API (a diferencia de
 * turismo.larioja.gob.ar), por lo que el scraper es 100% HTML — parsea
 * la página de listing (`/experiencias/`) por season filter y luego cada
 * detalle `/experiencia/<slug>/`.
 *
 * Origen de los datos por campo:
 *   [LISTING] = parseo del listing `/experiencias/?type=<season>`
 *   [HTML]    = parseo del HTML público de cada `/experiencia/<slug>/`
 *   [DERIV]   = derivado/limpiado por el scraper
 */

import type { Term, GalleryImage, PageMeta } from './schema';

// Reutilizamos Term, GalleryImage y PageMeta del schema La Rioja —
// son tipos genéricos y no atan a una provincia.

export interface ExperienciaChubut {
  /** [LISTING] Slug URL-friendly (último segmento del path). Único. */
  slug: string;

  /** [LISTING] URL canónica de la experiencia en el sitio público. */
  link: string;

  /** [HTML] Título visible (h1 o og:title). */
  title: string;

  /** [HTML] Descripción con HTML simplificado (sólo <p>). */
  descriptionHtml: string;

  /** [HTML/DERIV] Descripción en texto plano normalizado. */
  descriptionText: string;

  /**
   * [LISTING/DERIV] Temporadas en las que aparece la experiencia en el listing
   * filtrado (`?type=invierno`, etc.). Una experiencia puede aparecer en varias.
   * Strings literales: "invierno" | "primavera" | "verano" | "otono".
   */
  seasonalTags: string[];

  /**
   * [HTML] Público objetivo extraído de las chips visibles en la página
   * (ej. "Adultos", "Familias", "Jóvenes", "Niños").
   */
  audienceTags: string[];

  /**
   * [HTML] Tipo turístico extraído de las chips de filtro del sitio
   * (ej. "Aventuras y Emociones", "Sabores y Lugares", "Escenarios Naturales").
   */
  typeTags: string[];

  /**
   * [HTML/DERIV] Frases tipo "en Sarmiento", "cerca de Esquel" detectadas
   * en la descripción. Heurística para luego mappear a un departamento del
   * catálogo en el seed.
   */
  locationCandidates: string[];

  /** [HTML] Galería de imágenes. Coverage variable según la página. */
  gallery: GalleryImage[];

  /** [HTML] URLs de imágenes hero (og:image + background-image CSS). */
  heroImages: string[];

  /**
   * [HTML] Links a Google Maps si los hubiera. La mayoría de las páginas
   * Chubut no embeben mapas — la lista suele estar vacía.
   */
  mapsLinks: string[];

  /** [HTML] `src` de cada <iframe>. */
  iframeSrcs: string[];

  /** [HTML] Meta tags + Open Graph del <head>. */
  meta: PageMeta;

  /**
   * [DERIV] Coordenadas geográficas. Para Chubut casi nunca extraíbles del
   * HTML → en el seed usamos el centroide del departamento resuelto desde
   * `locationCandidates`.
   */
  coords: null;
}

// Re-exports para conveniencia
export type { Term, GalleryImage, PageMeta };

// ──────────────────────────────────────────────────────────────────────────────
// ARCHIVOS QUE GENERA EL SCRAPER
// ──────────────────────────────────────────────────────────────────────────────

/** output-chubut/actividades.json */
export type ExperienciasChubutFile = ExperienciaChubut[];

/**
 * output-chubut/taxonomies.json — misma forma que el de La Rioja para que el
 * seed pueda consumirlo idénticamente. Las clasificaciones acá mezclan
 * tipo + público (prefix `publico-`) + temporada (prefix `temporada-`).
 */
export interface ChubutTaxonomiesFile {
  clasificaciones: Record<string, Term>;
  departamentos: Record<string, Term>; // siempre {} — los deptos viven en el seed
  region: Record<string, Term>; // siempre {} — Chubut no usa esta dimensión
}

/** output-chubut/summary.json */
export interface ChubutSummaryFile {
  total: number;
  withGallery: number;
  withDescription: number;
  withLocationCandidates: number;
  seasonalTagsCount: number;
  audienceTagsCount: number;
  typeTagsCount: number;
  errors: { slug: string; error: string }[];
}
