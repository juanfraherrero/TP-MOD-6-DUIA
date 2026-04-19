import { StateGraph, START, END } from "@langchain/langgraph";
import { createLogger } from "@/lib/logger";
import { CustomerAnnotation } from "./state";
import {
	inputGuard,
	extractIntent,
	webEnrich,
	ragRetrieve,
	evaluateMatch,
	webEnrichRetry,
	rankAndExplain,
	guardrailCheck,
	emitResponse,
	routeInputGuard,
	routeEnrichment,
	routeEvaluation,
} from "./nodes";

const log = createLogger("agent:customer");

function build() {
	log.info("compilando grafo customer");
	const graph = new StateGraph(CustomerAnnotation)
		.addNode("input_guard", inputGuard)
		.addNode("extract_intent", extractIntent)
		.addNode("web_enrich", webEnrich)
		.addNode("rag_retrieve", ragRetrieve)
		.addNode("evaluate_match", evaluateMatch)
		.addNode("web_enrich_retry", webEnrichRetry)
		.addNode("rank_and_explain", rankAndExplain)
		.addNode("guardrail_check", guardrailCheck)
		.addNode("emit_response", emitResponse)
		.addEdge(START, "input_guard")
		.addConditionalEdges("input_guard", routeInputGuard, {
			extract_intent: "extract_intent",
			emit_response: "emit_response",
		})
		.addConditionalEdges("extract_intent", routeEnrichment, {
			web_enrich: "web_enrich",
			rag_retrieve: "rag_retrieve",
		})
		.addEdge("web_enrich", "rag_retrieve")
		.addEdge("rag_retrieve", "evaluate_match")
		.addConditionalEdges("evaluate_match", routeEvaluation, {
			web_enrich_retry: "web_enrich_retry",
			rank_and_explain: "rank_and_explain",
		})
		.addEdge("web_enrich_retry", "rag_retrieve")
		.addEdge("rank_and_explain", "guardrail_check")
		.addEdge("guardrail_check", "emit_response")
		.addEdge("emit_response", END);

	return graph.compile();
}

type CompiledGraph = ReturnType<typeof build>;

const globalForGraph = globalThis as unknown as {
	__customerGraph?: CompiledGraph;
};

// En dev, forzamos rebuild del grafo cada vez que se re-evalúa este módulo
// (sucede en HMR cuando se modifica graph.ts o nodes.ts). Compilar un
// StateGraph es barato — solo arma el wiring — y evita que cambios en
// nodos/transiciones requieran reiniciar `npm run dev`.
// El DataSource y el pipeline de embeddings sí se mantienen cacheados
// porque son caros (conexiones, modelo en memoria).
if (process.env.NODE_ENV !== "production") {
	globalForGraph.__customerGraph = undefined;
}

export function getCustomerGraph(): CompiledGraph {
	globalForGraph.__customerGraph ??= build();
	return globalForGraph.__customerGraph;
}
