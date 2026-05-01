import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { createLogger } from "@/lib/logger";

const log = createLogger("rag:embed");

export const EMBEDDING_DIM = 384;

const MODEL_ID = "Xenova/multilingual-e5-small";

const globalForEmbedder = globalThis as unknown as {
  __embedderPromise?: Promise<FeatureExtractionPipeline>;
};

function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!globalForEmbedder.__embedderPromise) {
    log.info(`cargando modelo ${MODEL_ID} (primera vez descarga desde HF)`);
    const end = log.time("modelo cargado");
    globalForEmbedder.__embedderPromise = (async () => {
      // `pipeline()` tiene un return type de union enorme dependiendo del task —
      // TS lo marca "too complex". Cast vía unknown al tipo específico del task.
      const raw = await (pipeline as unknown as (
        task: string,
        model: string,
      ) => Promise<FeatureExtractionPipeline>)("feature-extraction", MODEL_ID);
      end();
      return raw;
    })();
  }
  return globalForEmbedder.__embedderPromise;
}

async function embed(
  text: string,
  prefix: "query" | "passage",
): Promise<number[]> {
  const pipe = await getPipeline();
  const end = log.time(`embed ${prefix} len=${text.length}`);
  const output = await pipe(`${prefix}: ${text}`, {
    pooling: "mean",
    normalize: true,
  });
  const vec = Array.from(output.data as Float32Array);
  end();
  return vec;
}

export const embedDocument = (text: string) => embed(text, "passage");
export const embedQuery = (text: string) => embed(text, "query");

// Retry con backoff exponencial para embedDocument. Útil sobre todo en cold
// start del modelo HF (la primera invocación tras descarga puede tardar lo
// suficiente como para gatillar timeouts intermitentes en el runtime de Next).
// El último error se propaga al caller para que la transacción de ingesta
// pueda hacer rollback y la API devuelva 500 (no tragar el fallo).
export async function embedDocumentWithRetry(
  text: string,
  attempts = 3,
): Promise<number[]> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await embedDocument(text);
    } catch (err) {
      lastErr = err;
      log.warn("embed failed, retry", {
        attempt: i + 1,
        of: attempts,
        error: String(err).slice(0, 200),
      });
      if (i < attempts - 1) {
        // 200ms, 400ms — total <1s antes de propagar.
        await new Promise((r) => setTimeout(r, 200 * Math.pow(2, i)));
      }
    }
  }
  throw lastErr;
}

export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
