import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = 'https://turismo.larioja.gob.ar';
const API = `${BASE}/wp-json/wp/v2`;
const OUT = path.join(__dirname, 'output');
const RAW = path.join(__dirname, 'raw');

const REQUEST_DELAY_MS = 300;
const USER_AGENT = 'Mozilla/5.0 (compatible; TPDUIAScraper/0.1; academic project)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpGet(url, { asText = false } = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok && res.status !== 400) {
    throw new Error(`GET ${url} → ${res.status}`);
  }
  return { res, body: asText ? await res.text() : await res.json() };
}

async function fetchAllPages(endpoint, perPage = 100) {
  const all = [];
  let page = 1;
  while (true) {
    const url = `${endpoint}?per_page=${perPage}&page=${page}`;
    const { res, body } = await httpGet(url);
    if (res.status === 400) break;
    if (!Array.isArray(body) || body.length === 0) break;
    all.push(...body);
    const totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1', 10);
    if (page >= totalPages) break;
    page++;
    await sleep(REQUEST_DELAY_MS);
  }
  return all;
}

async function buildTermDict(taxonomy) {
  const terms = await fetchAllPages(`${API}/${taxonomy}`);
  const dict = {};
  for (const t of terms) {
    dict[t.id] = { id: t.id, name: t.name, slug: t.slug, count: t.count };
  }
  return dict;
}

async function resolveShortMapsUrl(url) {
  if (!/maps\.app\.goo\.gl|goo\.gl\/maps/.test(url)) return url;
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
    });
    return res.url || url;
  } catch {
    return url;
  }
}

function extractCoords(urls) {
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/, // /@lat,lng
    /[?&]q=(-?\d+\.\d+),\s*\+?(-?\d+\.\d+)/, // ?q=lat,lng
    /[?&]ll=(-?\d+\.\d+),\s*\+?(-?\d+\.\d+)/, // ?ll=lat,lng
    /\/maps\/(?:search|place|dir)\/[^?]*?(-?\d+\.\d+),\s*\+?(-?\d+\.\d+)/, // /maps/search/lat,+lng
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // embed-style: 3d=lat 4d=lng
  ];
  for (const url of urls) {
    for (const re of patterns) {
      const m = url.match(re);
      if (m) {
        const a = parseFloat(m[1]);
        const b = parseFloat(m[2]);
        // !3d/!4d order is lat,lng (same as the rest); leave consistent.
        return { lat: a, lng: b, source: url };
      }
    }
  }
  return null;
}

function parseActivityHtml(html) {
  const $ = cheerio.load(html);

  const title =
    $('h2.elementor-heading-title').first().text().trim() ||
    $('h1.entry-title').first().text().trim() ||
    $('title').text().trim();

  // Description: every jet-listing-dynamic-field__content block, in order
  const descBlocks = [];
  $('.jet-listing-dynamic-field__content').each((_, el) => {
    const html = ($(el).html() || '').trim();
    if (html) descBlocks.push(html);
  });
  const descriptionHtml = descBlocks.join('\n\n');
  const descriptionText = cheerio
    .load(`<div>${descriptionHtml}</div>`)('div')
    .text()
    .replace(/\s+/g, ' ')
    .trim();

  // Departamento (the term block with the map-pin icon)
  const departamentoLabels = [];
  $('.jet-listing-dynamic-terms').each((_, el) => {
    const $el = $(el);
    if ($el.find('svg.e-fas-map-marked-alt').length) {
      $el.find('.jet-listing-dynamic-terms__link').each((_, a) => {
        departamentoLabels.push($(a).text().trim());
      });
    }
  });

  // All term chips (categorias + departamentos sin distinguir)
  const allTermLabels = [];
  $('.jet-listing-dynamic-terms__link').each((_, el) => {
    const t = $(el).text().trim();
    if (t) allTermLabels.push(t);
  });

  // Gallery
  const gallery = [];
  $('.jet-engine-gallery-slider__item').each((_, el) => {
    const $el = $(el);
    const $a = $el.find('a').first();
    const $img = $el.find('img').first();
    gallery.push({
      full: $a.attr('href') || null,
      thumb: $img.attr('src') || null,
      caption: $a.attr('data-elementor-lightbox-title') || $img.attr('alt') || null,
    });
  });

  // Hero / background image (Elementor inline css OR data-settings)
  const heroImages = [];
  $('style').each((_, el) => {
    const css = $(el).html() || '';
    const re = /background-image:\s*url\(["']?([^"')]+)["']?\)/g;
    let m;
    while ((m = re.exec(css)) !== null) {
      heroImages.push(m[1]);
    }
  });

  // External links by class
  const allLinks = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#')) return;
    allLinks.push({ href, text: $(el).text().trim() });
  });

  const mapsLinks = allLinks
    .map((l) => l.href)
    .filter((h) =>
      /maps\.app\.goo\.gl|google\.com\/maps|goo\.gl\/maps|maps\.google\./.test(h)
    );

  const iframeSrcs = [];
  $('iframe[src]').each((_, el) => {
    iframeSrcs.push($(el).attr('src'));
  });

  // Meta + Open Graph
  const meta = {
    title:
      $('meta[property="og:title"]').attr('content') ||
      $('title').text().trim(),
    description:
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      null,
    image: $('meta[property="og:image"]').attr('content') || null,
    canonical: $('link[rel="canonical"]').attr('href') || null,
    locale: $('meta[property="og:locale"]').attr('content') || null,
    type: $('meta[property="og:type"]').attr('content') || null,
  };

  // JSON-LD blocks
  const jsonLd = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      jsonLd.push(JSON.parse(raw));
    } catch {
      /* skip malformed */
    }
  });

  // Featured / hero image as listed on the page (single-post-featured)
  const featuredImage =
    $('.ast-single-post-featured-section img').attr('src') ||
    $('article .post-thumb img').attr('src') ||
    null;

  return {
    title,
    descriptionHtml,
    descriptionText,
    departamentoLabels,
    allTermLabels,
    gallery,
    heroImages: [...new Set(heroImages)],
    featuredImage,
    mapsLinks: [...new Set(mapsLinks)],
    iframeSrcs,
    allLinks,
    meta,
    jsonLd,
  };
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  await fs.mkdir(RAW, { recursive: true });

  console.log('[1/4] Fetching taxonomies…');
  const [clasif, depts, region] = await Promise.all([
    buildTermDict('clasificacion-de-actividades'),
    buildTermDict('departamentos'),
    buildTermDict('region'),
  ]);
  await fs.writeFile(
    path.join(OUT, 'taxonomies.json'),
    JSON.stringify({ clasificaciones: clasif, departamentos: depts, region }, null, 2)
  );
  console.log(
    `      → clasif=${Object.keys(clasif).length}, depts=${Object.keys(depts).length}, region=${Object.keys(region).length}`
  );

  console.log('[2/4] Fetching all activities (REST API)…');
  const apiActivities = await fetchAllPages(`${API}/actividades`);
  await fs.writeFile(
    path.join(OUT, 'activities-api.json'),
    JSON.stringify(apiActivities, null, 2)
  );
  console.log(`      → ${apiActivities.length} actividades`);

  console.log('[3/4] Scraping HTML for each activity…');
  const enriched = [];
  for (let i = 0; i < apiActivities.length; i++) {
    const act = apiActivities[i];
    const idx = `[${String(i + 1).padStart(3)}/${apiActivities.length}]`;
    process.stdout.write(`  ${idx} ${act.slug} … `);
    try {
      const res = await fetch(act.link, {
        headers: { 'User-Agent': USER_AGENT },
      });
      const html = await res.text();
      await fs.writeFile(path.join(RAW, `${act.slug}.html`), html);

      const parsed = parseActivityHtml(html);

      // Resolve short maps URLs to extract coords
      const resolvedMapsLinks = [];
      for (const url of parsed.mapsLinks) {
        const resolved = await resolveShortMapsUrl(url);
        resolvedMapsLinks.push({ original: url, resolved });
        await sleep(150);
      }
      const coordsCandidates = [
        ...resolvedMapsLinks.map((r) => r.resolved),
        ...parsed.iframeSrcs,
      ];
      const coords = extractCoords(coordsCandidates);

      enriched.push({
        id: act.id,
        slug: act.slug,
        link: act.link,
        date: act.date,
        modified: act.modified,
        status: act.status,
        type: act.type,
        title: act.title?.rendered || parsed.title,
        clasificaciones: (act['clasificacion-de-actividades'] || [])
          .map((id) => clasif[id])
          .filter(Boolean),
        departamentos: (act.departamentos || [])
          .map((id) => depts[id])
          .filter(Boolean),
        region: (act.region || []).map((id) => region[id]).filter(Boolean),
        coords,
        ...parsed,
        mapsLinks: resolvedMapsLinks,
        classList: act.class_list,
      });
      console.log(coords ? `ok (coords ${coords.lat},${coords.lng})` : 'ok');
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      enriched.push({
        id: act.id,
        slug: act.slug,
        link: act.link,
        error: e.message,
      });
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log('[4/4] Writing output…');
  await fs.writeFile(
    path.join(OUT, 'actividades.json'),
    JSON.stringify(enriched, null, 2)
  );

  const summary = {
    total: enriched.length,
    withCoords: enriched.filter((e) => e.coords).length,
    withGallery: enriched.filter((e) => e.gallery?.length).length,
    withDescription: enriched.filter((e) => e.descriptionText).length,
    errors: enriched.filter((e) => e.error).map((e) => ({ slug: e.slug, error: e.error })),
  };
  await fs.writeFile(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log(`\n✓ Done`);
  console.log(`  output/actividades.json  (${summary.total} entries)`);
  console.log(`  output/activities-api.json`);
  console.log(`  output/taxonomies.json`);
  console.log(`  output/summary.json`);
  console.log(`  raw/<slug>.html          (raw HTML cache)`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
