import { NextRequest } from "next/server";
import { getCustomerGraph } from "@/agents/customer/graph";
import type { ChatMessage } from "@/agents/customer/state";
import { createLogger } from "@/lib/logger";
import { parseDevice } from "@/lib/analytics/device";
import { recordEventBatch } from "@/lib/services/event";
import type { RecordEventInput } from "@/lib/services/event";

const log = createLogger("api:chat-cust");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RequestBody = {
  sessionId: string;
  messages: ChatMessage[];
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as RequestBody;
  const messages = body.messages ?? [];
  const sessionId = body.sessionId || "anonymous";
  const device = parseDevice(req.headers.get("user-agent") ?? "");

  log.info("mensaje nuevo", { msgCount: messages.length, device });

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
        const graph = getCustomerGraph();
        const iter = await graph.stream({
          messages,
          webRetries: 0,
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
            // Acumulamos el estado final para emitir chat_turn_completed después.
            finalState = { ...finalState, ...update };
            if (update.pendingEvents) {
              finalState.pendingEvents = [
                ...(finalState.pendingEvents ?? []),
                ...(update.pendingEvents as RecordEventInput[]),
              ];
            }
          }
        }

        send("done", {
          response: finalState.response,
          ranked: finalState.ranked,
          closingMessage: finalState.closingMessage,
          matchQuality: finalState.matchQuality,
        });

        // Persistir los eventos acumulados por los nodos + el turn_completed.
        const durationMs = Date.now() - turnStart;
        const pending = (finalState.pendingEvents ?? []) as Array<{
          eventType: string;
          payload: Record<string, unknown>;
        }>;

        const events: RecordEventInput[] = pending.map((e) => ({
          sessionId,
          eventType: e.eventType,
          device,
          path: "/",
          payload: e.payload,
        }));

        // Métricas de retrieval/evaluation (G3): permiten correlacionar
        // calidad semántica del catálogo (topDistance), volumen de hits
        // pre-evaluator (candidatesCount) y la distribución de scores del
        // evaluator (evaluationScores) con el matchQuality final.
        const evaluationScores: number[] = Array.isArray(finalState.evaluation)
          ? (finalState.evaluation as Array<{ relevance: number }>).map(
              (e) => e.relevance,
            )
          : [];
        const candidates = (finalState.candidates ?? []) as Array<{
          distance: number;
        }>;
        const topDistance = candidates[0]?.distance ?? null;
        const candidatesCount = candidates.length;

        events.push({
          sessionId,
          eventType: "chat_turn_completed",
          device,
          path: "/",
          payload: {
            durationMs,
            nodesRun,
            matchQuality: finalState.matchQuality ?? null,
            webRetries: finalState.webRetries ?? 0,
            hadWebEnrichment: nodesRun.includes("web_enrich"),
            blockedByInputGuard: pending.some(
              (e) => e.eventType === "guardrail_input_blocked",
            ),
            blockedByOutputGuard: pending.some(
              (e) => e.eventType === "guardrail_output_blocked",
            ),
            evaluationScores,
            topDistance,
            candidatesCount,
            intent: finalState.intent
              ? {
                  placeNames: finalState.intent.placeNames ?? [],
                  filters: finalState.intent.filters ?? {},
                }
              : null,
          },
        });

        await recordEventBatch(events);
        log.info("turno ok", { durationMs, eventsPersisted: events.length });
      } catch (err) {
        log.error("graph error", { error: String(err) });
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
