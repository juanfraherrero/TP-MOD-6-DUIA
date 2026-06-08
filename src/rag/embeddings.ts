import {
  type EmbedContentRequest,
  GoogleGenerativeAI,
  TaskType,
} from "@google/generative-ai";
import { createLogger } from "@/lib/logger";

const log = createLogger("rag:embed");

// gemini-embedding-001 es el modelo de embeddings estable. Su dim nativo es
// 3072, pero soporta `outputDimensionality` para truncar a 768 / 1536
// (Matryoshka Representation Learning — las primeras N dims son una
// representación autocontenida). Elegimos 768 para mantener storage chico y
// la migration ya existente (vector(768)).
//
// Si cambiás el modelo o la dim, actualizar también la migration de vector(N).
export const EMBEDDING_DIM = 768;

const MODEL_ID = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";

const globalForClient = globalThis as unknown as {
  __geminiEmbedClient?: GoogleGenerativeAI;
};

function getClient(): GoogleGenerativeAI {
  if (!globalForClient.__geminiEmbedClient) {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY no está definido");
    }
    log.info(`init Gemini embed client model=${MODEL_ID} dim=${EMBEDDING_DIM}`);
    globalForClient.__geminiEmbedClient = new GoogleGenerativeAI(apiKey);
  }
  return globalForClient.__geminiEmbedClient;
}

async function embed(text: string, taskType: TaskType): Promise<number[]> {
  const model = getClient().getGenerativeModel({ model: MODEL_ID });
  const end = log.time(`embed ${taskType} len=${text.length}`);

  // `outputDimensionality` no está en los types del SDK 0.24.1 pero el SDK
  // hace JSON.stringify de los params y la API lo respeta. Cast a un tipo
  // extendido para mantener el chequeo del resto de campos.
  const req: EmbedContentRequest & { outputDimensionality?: number } = {
    content: { role: "user", parts: [{ text }] },
    taskType,
    outputDimensionality: EMBEDDING_DIM,
  };

  const result = await model.embedContent(req);
  end();
  return result.embedding.values;
}

export async function embedQuery(text: string): Promise<number[]> {
  return embed(text, TaskType.RETRIEVAL_QUERY);
}

export async function embedDocument(text: string): Promise<number[]> {
  return embed(text, TaskType.RETRIEVAL_DOCUMENT);
}

// Retry con backoff exponencial para embedDocument. Útil para tragones
// transitorios del rate-limit de Gemini durante ingestas grandes.
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
        await new Promise((r) => setTimeout(r, 200 * 2 ** i));
      }
    }
  }
  throw lastErr;
}

export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
