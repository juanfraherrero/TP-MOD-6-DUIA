import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = 'https://chubutpatagonia.gob.ar';
const LISTING = `${BASE}/experiencias/`;
const SEASONS = ['invierno', 'primavera', 'verano', 'otono'];
const OUT = path.join(__dirname, 'output-chubut');
const RAW = path.join(__dirname, 'raw-chubut');

const REQUEST_DELAY_MS = 350;
const USER_AGENT = 'Mozilla/5.0 (compatible; TPDUIAScraper/0.2; academic project)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return await res.text();
}

function extractExperienceSlugs(html) {
  const $ = cheerio.load(html);
  const slugs = new Set();
  $('a[href*="/experiencia/"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(/\/experiencia\/([^/?#]+)\/?/);
    if (m && m[1] && m[1] !== '') slugs.add(m[1]);
  });
  return [...slugs];
}

function parseDetailPage(html, url) {
  const $ = cheerio.load(html);

  const title =
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().trim();

  // Description: main article / entry-content blocks. Chubut uses a mix of
  // .entry-content, .elementor-widget-text-editor, .single-experiencia divs.
  // Strategy: pull every <p> inside the main content area excluding nav/footer.
  const paragraphs = [];
  const candidateContainers = [
    '.entry-content',
    'article .elementor-widget-text-editor',
    'article .elementor-widget-theme-post-content',
    'main article',
    'article',
  ];
  let $container = null;
  for (const sel of candidateContainers) {
    const $c = $(sel).first();
    if ($c.length && $c.find('p').length >= 1) {
      $container = $c;
      break;
    }
  }
  if (!$container) $container = $('body');

  $container.find('p').each((_, el) => {
    const txt = $(el).text().replace(/\s+/g, ' ').trim();
    if (txt && txt.length > 20) paragraphs.push(txt);
  });

  // De-dup paragraphs (some Elementor layouts duplicate inside widgets).
  const seen = new Set();
  const dedupedParagraphs = paragraphs.filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });

  const descriptionText = dedupedParagraphs.join('\n\n').slice(0, 8000);
  const descriptionHtml = dedupedParagraphs
    .map((p) => `<p>${p}</p>`)
    .join('\n');

  // Gallery — collect img tags inside the main container plus any
  // wp-content/uploads URLs from background-image CSS. Filter out icons/avatars.
  const gallerySet = new Map(); // url → {full, thumb, caption}
  $container.find('img').each((_, el) => {
    const $img = $(el);
    const src = $img.attr('src') || $img.attr('data-src') || null;
    if (!src) return;
    if (!/\/wp-content\/uploads\//.test(src)) return;
    // Skip tiny icons / logos
    const w = parseInt($img.attr('width') || '0', 10);
    if (w > 0 && w < 80) return;
    const caption = $img.attr('alt') || null;
    const full = src;
    const thumb = src;
    if (!gallerySet.has(full)) {
      gallerySet.set(full, { full, thumb, caption });
    }
  });

  // Hero / featured image from <head> meta + Elementor inline styles
  const heroImages = [];
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage) heroImages.push(ogImage);
  $('style, [style]').each((_, el) => {
    const css = $(el).attr('style') || $(el).html() || '';
    const re = /background-image:\s*url\(["']?([^"')]+)["']?\)/g;
    let m;
    while ((m = re.exec(css)) !== null) {
      if (/\/wp-content\/uploads\//.test(m[1])) heroImages.push(m[1]);
    }
  });
  const heroImagesUnique = [...new Set(heroImages)];

  // Audience tags ("Adultos, Familias, Jóvenes, Niños") and type tags
  // ("Aventuras y Emociones", "Sabores y Lugares", etc.).
  // These render as chip-like links / list items in Chubut's template.
  // Heuristic: look for terms / chip lists that aren't navigation.
  const audienceCandidates = new Set();
  const typeCandidates = new Set();
  const AUDIENCE_VOCAB = new Set([
    'adultos',
    'adultos mayores',
    'familias',
    'jovenes',
    'jóvenes',
    'ninos',
    'niños',
    'parejas',
  ]);
  const TYPE_VOCAB = new Set([
    'accesible',
    'aventuras y emociones',
    'bienestar',
    'congresos y convenciones',
    'cruceros',
    'escenarios naturales',
    'historia y tradicion',
    'historia y tradición',
    'lgbtq',
    'sabores y lugares',
  ]);
  $('a, span, li').each((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    if (!text || text.length > 40) return;
    if (AUDIENCE_VOCAB.has(text)) audienceCandidates.add(text);
    if (TYPE_VOCAB.has(text)) typeCandidates.add(text);
  });
  const audienceTags = [...audienceCandidates];
  const typeTags = [...typeCandidates];

  // Location text — Chubut detail pages mention nearby towns in prose
  // ("a 28 kilómetros de Sarmiento"). Extract the FIRST town-like noun phrase.
  // Pattern: "en <TOWN>" / "de <TOWN>" / "cerca de <TOWN>" where TOWN starts uppercase.
  const fullText = descriptionText;
  const locMatches = [
    /\b(?:de|en|cerca de|hasta|desde)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,2})/g,
  ];
  const locationCandidates = new Set();
  for (const re of locMatches) {
    let m;
    while ((m = re.exec(fullText)) !== null && locationCandidates.size < 10) {
      const candidate = m[1].trim();
      if (candidate.length > 2 && candidate.length < 40) {
        locationCandidates.add(candidate);
      }
    }
  }
  const locationCandidatesArr = [...locationCandidates];

  // Maps links + iframes (in case some pages do have them)
  const mapsLinks = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (/maps\.app\.goo\.gl|google\.com\/maps|goo\.gl\/maps|maps\.google\./.test(href)) {
      mapsLinks.push(href);
    }
  });
  const iframeSrcs = [];
  $('iframe[src]').each((_, el) => {
    iframeSrcs.push($(el).attr('src'));
  });

  // Meta
  const meta = {
    title: $('meta[property="og:title"]').attr('content') || $('title').text().trim(),
    description:
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      null,
    image: $('meta[property="og:image"]').attr('content') || null,
    canonical: $('link[rel="canonical"]').attr('href') || null,
    locale: $('meta[property="og:locale"]').attr('content') || null,
    type: $('meta[property="og:type"]').attr('content') || null,
  };

  return {
    title,
    descriptionHtml,
    descriptionText,
    audienceTags,
    typeTags,
    locationCandidates: locationCandidatesArr,
    gallery: [...gallerySet.values()],
    heroImages: heroImagesUnique,
    mapsLinks: [...new Set(mapsLinks)],
    iframeSrcs,
    meta,
    sourceUrl: url,
  };
}

async function discoverSlugsBySeason() {
  console.log('[1/3] Discovering slugs from listing pages…');
  const seasonsBySlug = new Map(); // slug → Set<season>
  const allSlugs = new Set();

  // 1. Base listing (all)
  {
    const html = await fetchText(LISTING);
    const slugs = extractExperienceSlugs(html);
    console.log(`      base /experiencias/ → ${slugs.length} slugs`);
    for (const s of slugs) {
      allSlugs.add(s);
      if (!seasonsBySlug.has(s)) seasonsBySlug.set(s, new Set());
    }
    await sleep(REQUEST_DELAY_MS);
  }

  // 2. Per-season filtered listings
  for (const season of SEASONS) {
    const url = `${LISTING}?type%5B0%5D=${season}`;
    try {
      const html = await fetchText(url);
      const slugs = extractExperienceSlugs(html);
      console.log(`      type=${season} → ${slugs.length} slugs`);
      for (const s of slugs) {
        allSlugs.add(s);
        if (!seasonsBySlug.has(s)) seasonsBySlug.set(s, new Set());
        seasonsBySlug.get(s).add(season);
      }
    } catch (e) {
      console.log(`      type=${season} ERROR: ${e.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  return { allSlugs: [...allSlugs], seasonsBySlug };
}

async function scrapeAll() {
  await fs.mkdir(OUT, { recursive: true });
  await fs.mkdir(RAW, { recursive: true });

  const { allSlugs, seasonsBySlug } = await discoverSlugsBySeason();
  console.log(`      total unique slugs: ${allSlugs.length}`);

  console.log('[2/3] Scraping detail pages…');
  const enriched = [];
  // Track classifications globally to write a taxonomies.json
  const typeTermCounts = new Map(); // slug → { name, count }
  const audienceTermCounts = new Map();
  const seasonTermCounts = new Map();

  for (let i = 0; i < allSlugs.length; i++) {
    const slug = allSlugs[i];
    const idx = `[${String(i + 1).padStart(3)}/${allSlugs.length}]`;
    const url = `${BASE}/experiencia/${slug}/`;
    process.stdout.write(`  ${idx} ${slug} … `);
    try {
      const html = await fetchText(url);
      await fs.writeFile(path.join(RAW, `${slug}.html`), html);
      const parsed = parseDetailPage(html, url);

      const seasonalTags = [...(seasonsBySlug.get(slug) ?? [])];

      // Update taxonomy counts
      for (const t of parsed.typeTags) {
        const sl = slugify(t);
        const prev = typeTermCounts.get(sl) || { name: t, count: 0 };
        prev.count++;
        prev.name = t; // last wins
        typeTermCounts.set(sl, prev);
      }
      for (const t of parsed.audienceTags) {
        const sl = slugify(t);
        const prev = audienceTermCounts.get(sl) || { name: t, count: 0 };
        prev.count++;
        prev.name = t;
        audienceTermCounts.set(sl, prev);
      }
      for (const s of seasonalTags) {
        const sl = slugify(s);
        const prev = seasonTermCounts.get(sl) || { name: s, count: 0 };
        prev.count++;
        prev.name = s;
        seasonTermCounts.set(sl, prev);
      }

      enriched.push({
        slug,
        link: url,
        title: parsed.title,
        descriptionHtml: parsed.descriptionHtml,
        descriptionText: parsed.descriptionText,
        seasonalTags,
        audienceTags: parsed.audienceTags,
        typeTags: parsed.typeTags,
        locationCandidates: parsed.locationCandidates,
        gallery: parsed.gallery,
        heroImages: parsed.heroImages,
        mapsLinks: parsed.mapsLinks,
        iframeSrcs: parsed.iframeSrcs,
        meta: parsed.meta,
        coords: null,
      });
      console.log(
        `ok (gallery=${parsed.gallery.length}, seasons=${seasonalTags.length})`,
      );
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      enriched.push({ slug, link: url, error: e.message });
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log('[3/3] Writing output…');
  await fs.writeFile(
    path.join(OUT, 'actividades.json'),
    JSON.stringify(enriched, null, 2),
  );

  // Build taxonomies in the same shape the seed expects:
  // { clasificaciones, departamentos (empty), region (empty) }.
  // We fold seasonal + audience + type into clasificaciones — the seed
  // attaches Classification entities by slug regardless of subgroup.
  const toTermDict = (m, prefix = '') => {
    const out = {};
    let id = 1;
    for (const [slug, v] of m.entries()) {
      const finalSlug = prefix ? `${prefix}-${slug}` : slug;
      out[String(id)] = { id, name: v.name, slug: finalSlug, count: v.count };
      id++;
    }
    return out;
  };
  const clasificaciones = {
    ...toTermDict(typeTermCounts),
    ...toTermDict(audienceTermCounts, 'publico'),
    ...toTermDict(seasonTermCounts, 'temporada'),
  };
  // Re-assign sequential ids after merge
  let id = 1;
  const merged = {};
  for (const v of Object.values(clasificaciones)) {
    merged[String(id)] = { ...v, id };
    id++;
  }

  await fs.writeFile(
    path.join(OUT, 'taxonomies.json'),
    JSON.stringify(
      { clasificaciones: merged, departamentos: {}, region: {} },
      null,
      2,
    ),
  );

  const summary = {
    total: enriched.length,
    withGallery: enriched.filter((e) => e.gallery?.length).length,
    withDescription: enriched.filter((e) => e.descriptionText).length,
    withLocationCandidates: enriched.filter(
      (e) => e.locationCandidates?.length,
    ).length,
    seasonalTagsCount: seasonTermCounts.size,
    audienceTagsCount: audienceTermCounts.size,
    typeTagsCount: typeTermCounts.size,
    errors: enriched.filter((e) => e.error).map((e) => ({ slug: e.slug, error: e.error })),
  };
  await fs.writeFile(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log(`\n✓ Done`);
  console.log(`  output-chubut/actividades.json  (${summary.total} entries)`);
  console.log(`  output-chubut/taxonomies.json`);
  console.log(`  output-chubut/summary.json`);
  console.log(`  raw-chubut/<slug>.html`);
  console.log(JSON.stringify(summary, null, 2));
}

scrapeAll().catch((e) => {
  console.error(e);
  process.exit(1);
});
