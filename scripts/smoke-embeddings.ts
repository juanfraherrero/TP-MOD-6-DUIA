/**
 * Smoke test del embedder.
 *
 * Verifica end-to-end que el cambio de @huggingface/transformers a
 * Gemini text-embedding-004 quedó bien cableado:
 *   1. La API key de Google funciona.
 *   2. Las dos instances (query / document) responden.
 *   3. Los vectores tienen exactamente `EMBEDDING_DIM` (768) dimensiones.
 *   4. Los valores son numbers válidos (no NaN, no Infinity).
 *
 * No toca la DB. Hace 2 llamadas a Gemini (una embedQuery, una embedDocument).
 *
 * Uso: `npm run smoke:embeddings`
 */

import "reflect-metadata";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import {
  EMBEDDING_DIM,
  embedDocument,
  embedQuery,
} from "@/rag/embeddings";

type Check = { name: string; pass: boolean; detail?: string };

function checkVector(label: string, vec: number[]): Check[] {
  const checks: Check[] = [];

  checks.push({
    name: `${label}: dim = ${EMBEDDING_DIM}`,
    pass: vec.length === EMBEDDING_DIM,
    detail: `got=${vec.length}`,
  });

  const allNumbers = vec.every((v) => typeof v === "number" && Number.isFinite(v));
  checks.push({
    name: `${label}: all values are finite numbers`,
    pass: allNumbers,
  });

  // Sanity check: normalized vectors típicamente tienen valores en [-1, 1].
  // Gemini devuelve vectores que pueden no estar normalizados, pero todos los
  // valores deberían estar en un rango razonable (no 1e30 ni nada raro).
  const max = Math.max(...vec.map(Math.abs));
  checks.push({
    name: `${label}: max abs value < 10 (sanity)`,
    pass: max < 10,
    detail: `max=${max.toFixed(4)}`,
  });

  return checks;
}

async function main() {
  console.log(`\n→ Smoke test: Gemini embeddings (dim esperado = ${EMBEDDING_DIM})\n`);

  if (!process.env.GOOGLE_API_KEY) {
    console.error("✗ FALTA GOOGLE_API_KEY en .env");
    process.exit(1);
  }

  const queryText = "trekking en la patagonia";
  const docText =
    "Travesía de 3 días al Cerro Tronador con vivac. Incluye guía, " +
    "equipo de altura y traslados. Requiere experiencia previa en alta montaña.";

  let queryVec: number[];
  let docVec: number[];

  try {
    console.log(`  embedQuery("${queryText}")...`);
    const t0 = Date.now();
    queryVec = await embedQuery(queryText);
    console.log(`    ✓ ${Date.now() - t0}ms\n`);
  } catch (err) {
    console.error("✗ embedQuery falló:", err);
    process.exit(1);
  }

  try {
    console.log(`  embedDocument("${docText.slice(0, 50)}...")...`);
    const t0 = Date.now();
    docVec = await embedDocument(docText);
    console.log(`    ✓ ${Date.now() - t0}ms\n`);
  } catch (err) {
    console.error("✗ embedDocument falló:", err);
    process.exit(1);
  }

  const checks = [
    ...checkVector("query", queryVec),
    ...checkVector("doc", docVec),
  ];

  console.log("Resultados:");
  let allPass = true;
  for (const c of checks) {
    const icon = c.pass ? "✓" : "✗";
    const detail = c.detail ? ` (${c.detail})` : "";
    console.log(`  ${icon} ${c.name}${detail}`);
    if (!c.pass) allPass = false;
  }

  console.log(`\n  query[0..4]: [${queryVec.slice(0, 5).map((v) => v.toFixed(4)).join(", ")}, ...]`);
  console.log(`  doc[0..4]:   [${docVec.slice(0, 5).map((v) => v.toFixed(4)).join(", ")}, ...]`);

  if (allPass) {
    console.log("\n✓ Todo OK. Podés correr `npm run seed:chubut` con confianza.\n");
    process.exit(0);
  } else {
    console.error("\n✗ Algún check falló. NO corras el seed hasta arreglarlo.\n");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("✗ smoke test crasheó:", err);
  process.exit(1);
});
