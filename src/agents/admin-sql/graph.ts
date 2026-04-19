import { StateGraph, START, END } from "@langchain/langgraph";
import { createLogger } from "@/lib/logger";
import { AdminSqlAnnotation, type AdminSqlState } from "./state";
import {
  generateSql,
  validateSqlNode,
  executeSql,
  summarizeResult,
  routeValidation,
} from "./nodes";

const log = createLogger("agent:admin-sql");

function build() {
  log.info("compilando grafo admin-sql");
  const graph = new StateGraph(AdminSqlAnnotation)
    .addNode("generate_sql", generateSql)
    .addNode("validate_sql", validateSqlNode)
    .addNode("execute_sql", executeSql)
    .addNode("summarize_result", summarizeResult)
    .addEdge(START, "generate_sql")
    .addEdge("generate_sql", "validate_sql")
    .addConditionalEdges("validate_sql", routeValidation, {
      execute_sql: "execute_sql",
      summarize_result: "summarize_result",
    })
    .addEdge("execute_sql", "summarize_result")
    .addEdge("summarize_result", END);

  return graph.compile();
}

type CompiledGraph = ReturnType<typeof build>;

const globalForGraph = globalThis as unknown as {
  __adminSqlGraph?: CompiledGraph;
};

// Mismo patrón que customer/graph.ts: en dev invalidamos el grafo cacheado
// para que HMR refleje cambios en nodos/transiciones sin reiniciar el dev
// server. El DataSource y el LLM sí se mantienen cacheados (caros).
if (process.env.NODE_ENV !== "production") {
  globalForGraph.__adminSqlGraph = undefined;
}

export function getAdminSqlGraph(): CompiledGraph {
  globalForGraph.__adminSqlGraph ??= build();
  return globalForGraph.__adminSqlGraph;
}

export async function runAdminSqlAgent(
  question: string,
  messages: AdminSqlState["messages"] = [],
): Promise<AdminSqlState> {
  const graph = getAdminSqlGraph();
  const result = await graph.invoke({
    question,
    messages,
    pendingEvents: [],
  });
  return result;
}
