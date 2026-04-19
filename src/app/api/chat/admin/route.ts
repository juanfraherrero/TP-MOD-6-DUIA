import { NextRequest } from "next/server";
import { getAdminSqlGraph } from "@/agents/admin-sql/graph";
import type { ChatMessage } from "@/agents/admin-sql/state";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:chat-admin");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RequestBody = {
  sessionId?: string;
  messages: ChatMessage[];
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as RequestBody;
  const messages = body.messages ?? [];
  const sessionId = body.sessionId || "admin";

  // La pregunta es el último mensaje del usuario en el historial.
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const question = lastUser?.content?.trim() ?? "";

  log.info("turno admin nuevo", { sessionId, msgCount: messages.length });

  const turnStart = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      const nodesRun: string[] = [];

      try {
        if (!question) {
          send("done", {
            response:
              "No detecté pregunta en tu mensaje. Tirame una consulta en lenguaje natural, ej: \"¿cuántos usuarios hubo hoy?\".",
          });
          return;
        }

        const graph = getAdminSqlGraph();
        const iter = await graph.stream({
          question,
          messages,
          pendingEvents: [],
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let finalState: Record<string, any> = {};

        for await (const chunk of iter) {
          for (const [nodeName, update] of Object.entries(chunk) as [
            string,
            Record<string, unknown>,
          ][]) {
            nodesRun.push(nodeName);
            send("node", { node: nodeName, state: update });
            finalState = { ...finalState, ...update };
          }
        }

        send("done", {
          response: finalState.response,
          generatedSql: finalState.generatedSql,
          sqlReasoning: finalState.sqlReasoning,
          validationError: finalState.validationError,
          rows: finalState.rows,
          rowCount: finalState.rowCount,
        });

        const durationMs = Date.now() - turnStart;
        log.info("turno admin ok", {
          durationMs,
          nodesRun,
          hadValidationError: Boolean(finalState.validationError),
          rowCount: finalState.rowCount ?? null,
        });
      } catch (err) {
        log.error("graph error admin", { error: String(err) });
        send("error", { message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
