/**
 * localizeImage — descarga una imagen externa y la guarda localmente bajo
 * `public/uploads/scraped/<hash>.<ext>` para que Next.js la sirva desde
 * `/uploads/scraped/<hash>.<ext>`.
 *
 * Idempotente: el filename es `sha256(externalUrl).hex.slice(0, 16)`. Si el
 * archivo ya existe en disco, no re-descarga — sólo devuelve el path.
 *
 * Usado por `scripts/seed-la-rioja.ts` para evitar depender de URLs externas
 * (que pueden romperse, lentificarse o cambiar de origen) en el demo.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { createLogger } from "@/lib/logger";

const log = createLogger("seed:images");

const SCRAPED_DIR = join(process.cwd(), "public", "uploads", "scraped");
const PUBLIC_PREFIX = "/uploads/scraped";
const ALLOWED_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const TIMEOUT_MS = 15_000;

export type LocalizeResult = { url: string; localized: boolean };

function inferExt(externalUrl: string): string {
  try {
    const u = new URL(externalUrl);
    const ext = extname(u.pathname).toLowerCase();
    if (ALLOWED_EXTS.has(ext)) return ext;
  } catch {
    // fall through
  }
  return ".jpg";
}

function hashUrl(externalUrl: string): string {
  return createHash("sha256").update(externalUrl).digest("hex").slice(0, 16);
}

/**
 * Descarga `externalUrl` a `public/uploads/scraped/<hash>.<ext>`.
 *
 * - Si la URL ya es local (`/uploads/...`), la devuelve tal cual.
 * - Si el archivo ya está en disco, devuelve el path local sin re-descargar.
 * - En cualquier error de descarga / validación, lanza — el caller decide
 *   si mantener la URL externa o fallar duro.
 */
export async function localizeImage(externalUrl: string): Promise<LocalizeResult> {
  if (externalUrl.startsWith("/uploads/")) {
    return { url: externalUrl, localized: false };
  }

  const ext = inferExt(externalUrl);
  const hash = hashUrl(externalUrl);
  const filename = `${hash}${ext}`;
  const fullPath = join(SCRAPED_DIR, filename);
  const publicUrl = `${PUBLIC_PREFIX}/${filename}`;

  if (existsSync(fullPath)) {
    return { url: publicUrl, localized: false };
  }

  await mkdir(SCRAPED_DIR, { recursive: true });

  const end = log.time(`download ${hash}${ext}`);
  let res: Response;
  try {
    res = await fetch(externalUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } finally {
    end();
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  const ctMatchesImage = ALLOWED_CONTENT_TYPES.some((t) =>
    contentType.startsWith(t),
  );
  if (!ctMatchesImage) {
    throw new Error(`content-type no permitido: "${contentType}"`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_SIZE) {
    throw new Error(
      `archivo > ${MAX_SIZE} bytes (${buf.byteLength} bytes)`,
    );
  }

  await writeFile(fullPath, buf);
  log.debug("descargada", {
    hash,
    ext,
    bytes: buf.byteLength,
    contentType,
  });

  return { url: publicUrl, localized: true };
}
