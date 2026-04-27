import { StateGraph, START, END } from "@langchain/langgraph";
import { createLogger } from "@/lib/logger";
import { CustomerAnnotation } from "./state";
import {
	inputGuard,
	extractIntent,
	webEnrich,
	queryRewrite,
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
		.addNode("query_rewrite", queryRewrite)
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
			// isOnlyPlace=true → web_enrich antes de query_rewrite (el rewrite
			// va a usar el contexto de Tavily). Caso normal → directo a
			// query_rewrite. query_rewrite traduce el semanticQuery a
			// vocabulario técnico alineado con audience_tags + descripciones.
			web_enrich: "web_enrich",
			rag_retrieve: "query_rewrite",
		})
		.addEdge("web_enrich", "query_rewrite")
		.addEdge("query_rewrite", "rag_retrieve")
		.addEdge("rag_retrieve", "evaluate_match")
		.addConditionalEdges("evaluate_match", routeEvaluation, {
			web_enrich_retry: "web_enrich_retry",
			rank_and_explain: "rank_and_explain",
		})
		// El loop de retry vuelve por query_rewrite: el rewrite se beneficia
		// del contexto extra que dejó web_enrich_retry.
		.addEdge("web_enrich_retry", "query_rewrite")
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
