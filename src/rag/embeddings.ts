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

export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
