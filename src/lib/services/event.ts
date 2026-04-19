import { getDataSource } from "@/db/data-source";
import type { AnalyticsEvent } from "@/db/entities";
import type { Device } from "@/db/types";
import { createLogger } from "@/lib/logger";

const log = createLogger("svc:event");

// Ver el gotcha TypeORM + Next.js multi-bundle: lookup por NOMBRE del entity.
// Usamos el table name ("events") en vez del class name ("AnalyticsEvent")
// — el table name es el ID que TypeORM usa internamente para indexar la
// metadata y es 100% estable entre bundles. El class name a veces no
// resuelve en ciertas routes aunque la clase esté registrada.
const ENTITY = "events";

export type RecordEventInput = {
  sessionId: string;
  eventType: string;
  device: Device;
  path?: string | null;
  payload?: Record<string, unknown>;
};

export async function recordEvent(input: RecordEventInput): Promise<void> {
  const ds = await getDataSource();
  await ds.getRepository<AnalyticsEvent>(ENTITY).insert({
    sessionId: input.sessionId,
    eventType: input.eventType,
    device: input.device,
    path: input.path ?? null,
    // TypeORM QueryDeepPartialEntity narrows Record<string, unknown> recursivamente —
    // cast explícito porque el payload es un JSON opaco para la DB.
    payload: (input.payload ?? {}) as object,
  });
  log.debug("evento grabado", {
    eventType: input.eventType,
    sessionId: input.sessionId.slice(0, 8) + "…",
    device: input.device,
  });
}

// Graba múltiples eventos en una transacción. Útil para persistir los eventos
// pendientes acumulados durante un turno del grafo (ver /api/chat/customer).
export async function recordEventBatch(
  inputs: RecordEventInput[],
): Promise<void> {
  if (inputs.length === 0) return;
  const ds = await getDataSource();
  await ds.getRepository<AnalyticsEvent>(ENTITY).insert(
    inputs.map((i) => ({
      sessionId: i.sessionId,
      eventType: i.eventType,
      device: i.device,
      path: i.path ?? null,
      payload: (i.payload ?? {}) as object,
    })),
  );
  log.debug("batch de eventos grabado", { count: inputs.length });
}
