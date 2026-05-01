import { StateGraph, START, END } from "@langchain/langgraph";
import { createLogger } from "@/lib/logger";
import { CustomerAnnotation } from "./state";
import {
	inputGuard,
	extractIntent,
	queryRewrite,
	ragRetrieve,
	evaluateMatch,
	webEnrichRetry,
	rankAndExplain,
	guardrailCheck,
	emitResponse,
	routeInputGuard,
	routeEvaluation,
} from "./nodes";

const log = createLogger("agent:customer");

function build() {
	log.info("compilando grafo customer");
	const graph = new StateGraph(CustomerAnnotation)
		.addNode("input_guard", inputGuard)
		.addNode("extract_intent", extractIntent)
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
		// extract_intent → query_rewrite directo. La vieja rama isOnlyPlace
		// → web_enrich antes del rewrite se eliminó: el catálogo + el filtro
		// geo (resolveMentionedPlaces + Haversine 100km en rag_retrieve)
		// alcanzan para responder sin pagar la latencia + cuota Tavily.
		// web_enrich/Tavily sólo se invoca como rescate cuando evaluate_match
		// da bajo score (loop CRAG vía web_enrich_retry).
		.addEdge("extract_intent", "query_rewrite")
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
