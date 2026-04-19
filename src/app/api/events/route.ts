import { NextRequest, NextResponse } from "next/server";
import { recordEvent } from "@/lib/services/event";
import { parseDevice } from "@/lib/analytics/device";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:events");

export const dynamic = "force-dynamic";

type EventPayload = {
  sessionId?: string;
  eventType?: string;
  path?: string | null;
  payload?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as EventPayload;
    if (!body.sessionId || !body.eventType) {
      return NextResponse.json(
        { error: "sessionId y eventType son obligatorios" },
        { status: 400 },
      );
    }
    const device = parseDevice(req.headers.get("user-agent") ?? "");
    await recordEvent({
      sessionId: body.sessionId,
      eventType: body.eventType,
      device,
      path: body.path ?? null,
      payload: body.payload ?? {},
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("error grabando evento", { error: String(err) });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
