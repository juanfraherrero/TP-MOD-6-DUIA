---
name: logging
description: Use when adding or modifying logs anywhere in this TP DUIA project. Enforces the scoped logger pattern from src/lib/logger.ts — scope naming (module:subsystem), level selection (debug/info/warn/error), the time() timing helper, and meta object conventions. Apply whenever instrumenting new services, agent nodes, RAG ops, API routes, or debug output. Also applies when refactoring existing console.log/console.error calls into the scoped logger.
---

# Logging pattern

This project uses a custom logger at `src/lib/logger.ts`. **Do not use `console.log` / `console.error` for application flow.** Use the scoped logger so output is filterable, colored, and timestamped, and so future features (file transport, log aggregation) require changing only one file.

## Quick reference

```ts
import { createLogger } from "@/lib/logger";

const log = createLogger("svc:activity");

log.info("crear", { title: input.title });
log.debug("chunk 3/5 guardado");
log.warn("actividad no encontrada", { id });
log.error("fallo la ingesta", { error: String(err) });

// Timing helper — returns a callback that logs elapsed ms at debug level
const end = log.time("sql retrieve");
await ds.query(...);
end();   // prints: "sql retrieve (47ms)"
```

Import alias `@/lib/logger` is already configured in `tsconfig.json`.

## Scope naming convention

Format: `<module>:<subsystem>`. Keep ≤ 14 chars (the logger pads to that width for alignment).

| Scope | Where |
|---|---|
| `rag:embed` | `src/rag/embeddings.ts` |
| `rag:ingest` | `src/rag/ingest.ts` |
| `rag:retrieve` | `src/rag/retrieve.ts` |
| `svc:activity` | `src/lib/services/activity.ts` |
| `svc:<name>` | future services (conversation, event, etc.) |
| `agent:customer` | `src/agents/customer/` nodes |
| `agent:admin-sql` | `src/agents/admin-sql/` nodes |
| `agent:router` | intra-graph routers |
| `api:<name>` | only if a route needs logging beyond Next's request line |

**Adding a new subsystem**: pick a short module prefix (`rag`, `svc`, `agent`, `api`, `db`, `ui`) + colon + specifier. Be consistent across a single module — don't mix `svc:activity` and `service:activities`.

## Level selection

Use the right level so filters work (`LOG_LEVEL=info` should hide noise, not signal).

- **`debug`** — per-item loop noise (each chunk saved, each graph node transition, each SQL param). Hidden with `LOG_LEVEL=info`.
- **`info`** — high-level flow events: "service called", "ingest started/done", "retrieve returned N results", "agent transitioned to node X". This is the default for interesting events.
- **`warn`** — unexpected but recoverable: entity not found on delete, stale cache detected, fallback triggered.
- **`error`** — caught exceptions, failed operations. Always include the error in meta.

**Rule of thumb**: if you'd want to see it once per operation in a normal dev session, it's `info`. If it'd fire 10+ times per operation, it's `debug`.

## Timing helper (`log.time`)

Wrap any operation you want to measure:

```ts
const end = log.time("label");
await expensiveThing();
end();  // logs at debug level: "label (Xms)"
```

Always call `end()`. For operations that can throw but whose timing you still want:

```ts
const end = log.time("risky op");
try {
  await doIt();
} finally {
  end();
}
```

Use for: DB queries worth measuring, LLM calls, embedding generation, full agent turns, ingest pipelines.
Don't use for: trivial functions (< ~5ms), loops where you'd log N times (log the loop total instead).

## Meta objects

Second argument to log methods is optional; printed as compact JSON at end of line.

**Include:**
- Identifiers that make the log traceable: `activityId`, `sessionId`, `conversationId`, `messageId`.
- Counts, sizes, dimensions: `chunks: 3`, `totalChars: 612`, `topK: 5`.
- Short categorical values: `eventType: "message_sent"`, `role: "customer"`.

**Exclude:**
- Full entity payloads — noisy, and may contain data irrelevant to the log's purpose.
- Embedding vectors, long chunks, raw file contents — log `length` or a short hash instead.
- Secrets, API keys, auth tokens — ever.

**Good:**
```ts
log.info("ingesta ok", { activityId, chunks: 3, totalChars: 612 });
log.info("búsqueda", { query, topK, filters });
log.error("llm call fallida", { node: "rank", error: String(err) });
```

**Bad:**
```ts
log.info("ingesta ok", { activity: fullActivityObject, embeddings: [[...], [...]] });
log.debug("user auth", { email: user.email, token: user.token });
```

## Runtime control

Global minimum level via env var at `npm run dev` time:

```bash
LOG_LEVEL=debug npm run dev   # default — everything
LOG_LEVEL=info  npm run dev   # hide debug noise
LOG_LEVEL=warn  npm run dev   # only warnings + errors
LOG_LEVEL=error npm run dev   # only errors
```

The env var is read once at module load (`src/lib/logger.ts`).

## Don't

- **No `console.log` / `console.warn` / `console.error`** in `src/**` app code. Use `createLogger(...)`. (Exception: tooling scripts under `scripts/` may use `console` directly.)
- **No logger calls at module top level** that do real work (e.g. `log.info("loading module")` at import). Put logs inside functions so they fire on actual use, not on cold module eval.
- **No PII / secrets** in meta.
- **No per-character / per-token debug logs** — too noisy even at `debug`.
- **No string-concatenated JSON** (`log.info("foo " + JSON.stringify(x))`). Use the meta param so the logger handles formatting.

## Extending the logger

If you need more levels, file transport, remote shipping, request correlation IDs, etc. — modify `src/lib/logger.ts`. Keep the public API (`createLogger(scope) -> Logger`) stable so existing call sites don't change.

## Reference implementations

See these files for canonical usage:

- `src/rag/embeddings.ts` — model load timing, per-call timing with length meta.
- `src/rag/ingest.ts` — multi-step flow with total + per-chunk logs.
- `src/rag/retrieve.ts` — info on entry, timed SQL, info with result count.
- `src/lib/services/activity.ts` — service-level crear/actualizar/eliminar events with IDs.
