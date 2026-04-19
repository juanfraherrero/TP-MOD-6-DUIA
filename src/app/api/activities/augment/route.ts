import { NextRequest } from "next/server";
import { getAugmentGraph } from "@/agents/augment-activity/graph";
import type { AugmentInput } from "@/agents/augment-activity/state";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:augment");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RequestBody = Partial<AugmentInput>;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as RequestBody;
  const title = (body.title ?? "").trim();

  if (!title) {
    return new Response(
      JSON.stringify({ error: "title es requerido (mínimo para aumentar)" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const input: AugmentInput = {
    title,
    description: body.description ?? "",
    requirements: body.requirements ?? "",
    physicalPrep: body.physicalPrep ?? "",
    altitudeM: body.altitudeM ?? null,
    elevationGainM: body.elevationGainM ?? null,
  };

  log.info("augment nuevo", {
    title: title.slice(0, 80),
    hasDesc: Boolean(input.description),
  });

  const start = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      const nodesRun: string[] = [];

      try {
        const graph = getAugmentGraph();
        const iter = await graph.stream({
          input,
          sources: [],
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
          augmented: finalState.augmented,
          sources: finalState.sources ?? [],
          context: finalState.context,
        });

        const durationMs = Date.now() - start;
        log.info("augment ok", {
          durationMs,
          nodesRun,
          hadAugmented: Boolean(finalState.augmented),
          sources: (finalState.sources ?? []).length,
        });
      } catch (err) {
        log.error("augment error", { error: String(err) });
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
