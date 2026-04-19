import { StateGraph, START, END } from "@langchain/langgraph";
import { createLogger } from "@/lib/logger";
import { AugmentAnnotation, type AugmentState, type AugmentInput } from "./state";
import {
  extractContext,
  webResearch,
  synthesize,
  emitResponse,
} from "./nodes";

const log = createLogger("agent:augment");

function build() {
  log.info("compilando grafo augment");
  const graph = new StateGraph(AugmentAnnotation)
    .addNode("extract_context", extractContext)
    .addNode("web_research", webResearch)
    .addNode("synthesize", synthesize)
    .addNode("emit_response", emitResponse)
    .addEdge(START, "extract_context")
    .addEdge("extract_context", "web_research")
    .addEdge("web_research", "synthesize")
    .addEdge("synthesize", "emit_response")
    .addEdge("emit_response", END);

  return graph.compile();
}

type CompiledGraph = ReturnType<typeof build>;

const globalForGraph = globalThis as unknown as {
  __augmentGraph?: CompiledGraph;
};

// Mismo patrón que customer/graph.ts y admin-sql/graph.ts: en dev invalidamos
// el grafo cacheado para que HMR refleje cambios en nodos/transiciones sin
// reiniciar el dev server. El DataSource y el LLM sí se mantienen cacheados.
if (process.env.NODE_ENV !== "production") {
  globalForGraph.__augmentGraph = undefined;
}

export function getAugmentGraph(): CompiledGraph {
  globalForGraph.__augmentGraph ??= build();
  return globalForGraph.__augmentGraph;
}

export async function runAugmentAgent(
  input: AugmentInput,
): Promise<AugmentState> {
  const graph = getAugmentGraph();
  const result = await graph.invoke({
    input,
    sources: [],
    pendingEvents: [],
  });
  return result;
}
