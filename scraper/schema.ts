/**
 * Schema de cada actividad scrapeada desde turismo.larioja.gob.ar.
 * Archivo generado a partir de output/actividades.json (110 entries).
 *
 * Origen de los datos por campo:
 *   [API]   = WP REST /wp-json/wp/v2/actividades
 *   [HTML]  = parseo del HTML público de cada /actividades/{slug}/
 *   [TAX]   = WP REST de las taxonomias, resuelto por id
 *   [DERIV] = derivado/limpiado por el scraper
 */

// ──────────────────────────────────────────────────────────────────────────────
// SUB-TIPOS
// ──────────────────────────────────────────────────────────────────────────────

/** Término de taxonomia ya resuelto (no es sólo un id). */
export interface Term {
  id: number;
  name: string;     // ej. "Bodegas", "Chilecito"
  slug: string;     // ej. "bodegas", "chilecito"
  count: number;    // cantidad total de actividades en esa taxonomia
}

/** Coordenadas geográficas extraídas de los links a Google Maps. */
export interface Coords {
  lat: number;      // ej. -29.1643595
  lng: number;      // ej. -67.4951928
  source: string;   // URL desde donde se extrajo (para auditar)
}

/** Imagen de la galería de la actividad. */
export interface GalleryImage {
  full: string | null;     // URL del archivo grande (lightbox)
  thumb: string | null;    // URL del thumb usado en el slider
  caption: string | null;  // título del item (data-elementor-lightbox-title o alt)
}

/** Link encontrado en el HTML, con su texto visible. */
export interface PageLink {
  href: string;
  text: string;
}

/** Link a Google Maps, con la URL original (corta) y la resuelta tras seguir redirects. */
export interface MapsLink {
  original: string;   // ej. https://maps.app.goo.gl/abc
  resolved: string;   // ej. https://www.google.com/maps/place/.../@-29.16,-67.49,...
}

/** Meta tags / Open Graph del <head>. */
export interface PageMeta {
  title: string;                 // <title> o og:title
  description: string | null;    // og:description o meta[name=description]
  image: string | null;          // og:image
  canonical: string | null;      // <link rel="canonical">
  locale: string | null;         // og:locale
  type: string | null;           // og:type
}

// ──────────────────────────────────────────────────────────────────────────────
// ENTIDAD PRINCIPAL
// ──────────────────────────────────────────────────────────────────────────────

export interface Actividad {
  // // ── IDENTIDAD ──────────────────────────────────────────────────────────────
  // /** [API] ID interno de WordPress. Único, estable. Útil como primary key. */
  // id: number;

  // /** [API] Slug URL-friendly (último segmento del path). Único. */
  // slug: string;

  // /** [API] URL canónica de la actividad en el sitio público. */
  // link: string;

  // /** [API] Fecha de publicación (ISO sin TZ) y la misma en GMT (no expuesta aquí, ver activities-api.json). */
  // date: string;

  // /** [API] Última modificación (ISO). */
  // modified: string;

  // /** [API] Estado WP. En la práctica siempre "publish" en este dataset. */
  // status: 'publish' | string;

  // /** [API] Custom post type WP. Siempre "actividades". */
  // type: 'actividades' | string;

  // ── CONTENIDO PRINCIPAL ────────────────────────────────────────────────────
  /** [API] Título visible. Ej: "Bus de la Ruta del Vino Riojano | Chilecito y Famatina". */
  title: string;

  /** [HTML] Descripción completa con HTML embebido (párrafos, listas, <strong>, links). */
  descriptionHtml: string;

  /** [HTML/DERIV] Misma descripción pero en texto plano normalizado (espacios colapsados). */
  descriptionText: string;

  // ── CLASIFICACIÓN / TAXONOMIAS ─────────────────────────────────────────────
  /**
   * [TAX] Categorías temáticas. Ej: "Bodegas", "Museos y paseos", "Paseos",
   * "Ruta del Vino Riojano". Una actividad puede tener varias.
   */
  clasificaciones: Term[];

  /** [TAX] Departamento(s) donde está la actividad. Ej: "Chilecito", "Famatina". */
  departamentos: Term[];

  /** [TAX] Región turística (frecuentemente vacío en este dataset). */
  region: Term[];

  /**
   * [HTML] Etiquetas de departamento como aparecen renderizadas en la página
   * (cerca del icono del map-pin). Útil como fallback visual; usá `departamentos` para datos.
   */
  departamentoLabels: string[];

  /**
   * [HTML] Todos los labels de taxonomías visibles en el HTML, sin distinguir tipo.
   * Mezcla clasificaciones + departamentos. Útil si querés renderizar tags tal-cual.
   */
  allTermLabels: string[];

  /** [API] Lista de clases CSS aplicadas al article (mirror de class_list de WP). Útil para debug. */
  classList: string[];

  // ── GEO ────────────────────────────────────────────────────────────────────
  /**
   * [HTML/DERIV] Coordenadas extraídas de un link a Google Maps. null si la
   * actividad no incluye link/iframe geolocalizable. Coverage: 75/110 (~68%).
   */
  coords: Coords | null;

  // ── MULTIMEDIA ─────────────────────────────────────────────────────────────
  /** [HTML] Galería de imágenes (slider de JetEngine). Coverage: 110/110. */
  gallery: GalleryImage[];

  /**
   * [HTML] URLs de imágenes usadas como background-image en el CSS inline de
   * Elementor (típicamente la imagen hero del header de la actividad).
   */
  heroImages: string[];

  // /**
  //  * [HTML] Featured image clásica de WP, si la página la usa. En general null
  //  * en este sitio (usan hero CSS y galería). Útil sólo como fallback.
  //  */
  // featuredImage: string | null;

  // ── LINKS EXTERNOS ─────────────────────────────────────────────────────────
  /**
   * [HTML/DERIV] Links a Google Maps con URL original (corta) y resuelta.
   * De acá sale `coords`. Casi siempre tiene 0 o 1 entrada.
   */
  mapsLinks: MapsLink[];

  // /**
  //  * [HTML] `src` de cada <iframe>. Útil para mapas embebidos o videos.
  //  * En este sitio casi siempre vacío.
  //  */
  // iframeSrcs: string[];

  // /**
  //  * [HTML] Todos los <a> de la página con su href y texto. Pesado pero
  //  * conservado por si querés extraer redes sociales, teléfonos, mailto, etc.
  //  */
  // allLinks: PageLink[];

  // // ── METADATA / SEO ─────────────────────────────────────────────────────────
  // /** [HTML] Meta tags + Open Graph del <head>. */
  // meta: PageMeta;

  // /**
  //  * [HTML] Bloques <script type="application/ld+json"> parseados.
  //  * En este sitio típicamente vacío, pero queda por si lo agregan.
  //  */
  // jsonLd: unknown[];
}

// ──────────────────────────────────────────────────────────────────────────────
// ARCHIVOS QUE GENERA EL SCRAPER
// ──────────────────────────────────────────────────────────────────────────────

/** output/actividades.json */
export type ActividadesFile = Actividad[];

/** output/taxonomies.json */
export interface TaxonomiesFile {
  clasificaciones: Record<string, Term>;  // key = id como string
  departamentos: Record<string, Term>;
  region: Record<string, Term>;
}

/** output/summary.json */
export interface SummaryFile {
  total: number;
  withCoords: number;
  withGallery: number;
  withDescription: number;
  errors: { slug: string; error: string }[];
}
