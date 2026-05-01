# Arquitectura — TP DUIA

> Sistema Inteligente de Gestión y Venta para Agencia de Turismo.
> Documento vivo. Actualizar cuando cambien decisiones.

**Estado**: scaffolding inicial (2026-04-19).

> **Para la defensa del TP**: ver `docs/INFORME_TP.md` — documento orientado a evaluador con justificaciones completas, patrones académicos referenciados y próximos pasos.

---

## 1. Objetivo

Plataforma para una agencia de turismo que combina:

- Catálogo de actividades con búsqueda semántica (RAG).
- Agente conversacional para clientes (descubrimiento + refinamiento).
- Tracking de comportamiento en la interfaz.
- Dashboard en lenguaje natural para el administrador (text-to-SQL).

## 2. Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 20+ |
| Framework | Next.js 15 (App Router, React 19) |
| LLM provider | **Intercambiable vía env** (`LLM_PROVIDER`): Gemini 2.0 Flash (default) / Groq Llama 3.3 70B / Ollama local (fallback offline). Swap único en `src/agents/shared/llm.ts`. |
| Orquestación LLM | **LangGraph.js** (`@langchain/langgraph` + `@langchain/google-genai` + `@langchain/groq` + `@langchain/ollama`) |
| Streaming UI | Vercel AI SDK (`ai` + `@ai-sdk/react` + `@ai-sdk/groq`) |
| Base de datos | PostgreSQL 16 + **pgvector** |
| ORM | **TypeORM** |
| Validación | Zod |
| Estilos | Tailwind CSS |
| Auth (admin) | Auth.js |
| Empaquetado | Docker Compose (servicios: `web`, `db`) |

## 3. Módulos del brief → ubicación en el repo

| Módulo | Código principal |
|---|---|
| **A. Admin RAG** — catálogo + búsqueda vectorial + CRUD | `src/rag/`, `src/app/admin/activities/`, `src/app/api/activities/` |
| **B. Agente cliente** — identificación de necesidades, ranking de 3 propuestas, refinamiento | `src/agents/customer/`, `src/app/api/chat/customer/` |
| **C. Analytics y eventos** — tracking de dispositivo, mensajes, clics, conversiones | `src/lib/analytics/`, `src/db/entities/Event.ts`, `src/app/api/events/` |
| **D. Dashboard text-to-SQL** | `src/agents/admin-sql/`, `src/app/admin/dashboard/`, `src/app/api/chat/admin/` |
| **E. Data Augmentation del form de alta** (extra — ver §4.12) | `src/agents/augment-activity/`, `src/app/api/activities/augment/`, `src/components/activities/AugmentModal.tsx` |

## 4. Decisiones clave

### 4.1. Dos endpoints de chat separados

En lugar de un único `/api/chat` con agente ruteador centralizado:

- `POST /api/chat/customer` → agente cliente (LangGraph, Módulo B).
- `POST /api/chat/admin` → agente text-to-SQL (LangGraph, Módulo D).

**Razón**: flujos, prompts, herramientas y auth diferentes. Duplicación mínima aceptable a cambio de claridad. El "ruteador" del brief se mueve al nivel URL/rol en el front. Dentro de cada grafo puede haber sub-ruteadores internos si la complejidad lo amerita (ej. en el cliente: nueva búsqueda vs refinamiento; en el admin: SQL vs explicación).

### 4.2. Monorepo Next.js full-stack

UI + API en un solo proyecto. **Regla**: la lógica de dominio (`src/agents`, `src/rag`, `src/db`) no importa nada de Next. Las API routes son thin wrappers. Si a futuro separamos backend (Fastify/Express), se mueve ese subconjunto a un paquete aparte sin reescribir lógica.

### 4.3. Postgres + pgvector como única DB

Una sola base cubre RAG (chunks vectoriales), analytics (eventos), conversaciones e inventario. Menos infra, menos costos, todo queryable vía SQL — útil para alimentar el text-to-SQL del Módulo D.

### 4.4. TypeORM (no Drizzle ni Prisma)

Elegido por familiaridad del dev. **Caveats Next.js**:

- `tsconfig.json` requiere `experimentalDecorators: true` y `emitDecoratorMetadata: true` (ya configurado).
- `next.config.ts` declara `serverExternalPackages: ["typeorm", "pg"]` para evitar problemas de bundling.
- Entidades se registran **explícitamente** en el `DataSource` (NO con glob patterns) porque Next bundlea el server y rompe el descubrimiento dinámico de TypeORM.
- `reflect-metadata` se importa una sola vez en `src/db/data-source.ts`.

### 4.5. LangGraph.js para orquestación

Elegido por:
1. Valor académico — grafo explícito se presenta bien en la defensa del TP.
2. Facilita complicar flujos a futuro (ciclos, refinamiento iterativo, checkpointing, human-in-the-loop).

Vercel AI SDK se limita al streaming de respuestas al frontend (`useChat`). **No** orquesta agentes.

**LLM provider**: **Intercambiable por env var** `LLM_PROVIDER` (`gemini` | `groq` | `ollama`). Default es Gemini 2.0 Flash.

Los tres proveedores funcionan uniforme bajo la API de LangChain — tool calling y `withStructuredOutput` son agnósticos del backend. `src/agents/shared/llm.ts` es el ÚNICO archivo que instancia clientes LLM; cambiar `LLM_PROVIDER` + restart de `npm run dev` y el grafo entero usa el nuevo proveedor.

- **Gemini** (default): free tier generoso, multimodal, structured output estricto pero confiable.
- **Groq**: Llama 3.3 70B en inferencia rápida, free tier con rate limits — primera línea de fallback cloud.
- **Ollama** (local): corre en `localhost:11434` con modelos cuantizados (default `qwen2.5:7b-instruct`). Fallback offline cuando se agotan los free tiers cloud o para desarrollo sin internet. Caveat: tool calling / `withStructuredOutput` en modelos chicos locales (3B–7B) es menos confiable que en Groq/Gemini — ver skill.

**Historia real**: durante el testing del Módulo B, Groq baneó la cuenta del dev con `organization_restricted` sin previo aviso. El swap a Gemini tomó ~5 minutos porque la abstracción ya estaba lista. Ollama se agregó después como tercera capa por si tanto Groq como Gemini fallan o se agotan — tres providers, tres capas de fallback, un solo punto de cambio.

### 4.6. Agencia única (single-tenant)

No hay `organizationId` propagado por tablas. Si a futuro se requiere multi-tenant, migración explícita.

### 4.7. Ingesta de actividades via formulario estructurado

Campos: título, descripción, imagen, horarios, requisitos, preparación física, altitud, desnivel, etc. No hay parseo de PDFs ni texto libre — el pipeline de ingesta RAG concatena campos relevantes → chunkea → embedea → guarda en `activity_chunks` (pgvector).

### 4.8. Sin tests por ahora

Se omite Vitest/testing framework en la fase inicial. Agregar cuando haya flujos estables que valga la pena proteger de regresiones.

### 4.9. Logging estructurado en `src/lib/logger.ts`

Logger propio (cero deps, ANSI colors, scopes, niveles debug/info/warn/error, `time()` helper). Usado en RAG, services y a futuro en los agentes para seguir el flujo de la app desde la terminal en dev. Config vía `LOG_LEVEL` env var.

**Patrón y convenciones**: ver `.claude/skills/logging/SKILL.md` — documento vivo que define naming de scopes, elección de nivel, qué va en meta, qué no, y ejemplos canónicos. Cuando agregues logs, seguilo.

### 4.10. Schema via migración inicial + `migrationsRun: true`

**No se usa `synchronize: true`.** Razón: TypeORM no conoce el tipo `vector` de pgvector. Con `synchronize:true`:
- Declarar `embedding` como `vector(384)` → error (tipo desconocido).
- Declarar como `text` + alterar post-sync → funciona la primera vez, pero en cada reinicio synchronize revierte la columna a `text` y destruye el índice HNSW.

**Solución**: una migración inicial (`src/db/migrations/*-Init.ts`) que crea todas las tablas, incluyendo `activity_chunks.embedding vector(384)` y el índice HNSW con `vector_cosine_ops`. `data-source.ts` configura:

- `synchronize: false`
- `migrationsRun: true` — aplica migraciones pendientes automáticamente al iniciar

UX equivalente a synchronize (al levantar la app se arma todo) sin el conflicto con pgvector. Para evolucionar schema: `npm run migration:generate -- src/db/migrations/NombreDeLaMigracion` y se genera el diff.

**Importante**: las migraciones se importan **explícitamente** en `data-source.ts` (no glob) porque Next bundlea el server.

### 4.11. Text-to-SQL con validación estática + schema card inyectado

**Contexto (Módulo D)**: el dashboard admin traduce preguntas en lenguaje natural a SQL con el LLM. El riesgo obvio es que el modelo genere queries destructivas, lea tablas fuera de scope (como `activity_chunks` con vectores de 384 dim) o vuelque datasets sin límite.

**Decisión**: un grafo LangGraph de 4 nodos (`generate_sql` → `validate_sql` → conditional → `execute_sql` → `summarize_result`) con **validación estática antes de ejecución**, en vez de confiar solo en un pool Postgres read-only.

- El nodo `generate_sql` inyecta el **schema card completo** (`docs/ANALYTICS_SCHEMA.md`, cacheado module-level con `fs.readFileSync`) en el system prompt del LLM, con `withStructuredOutput` → `{sql, reasoning}`.
- El nodo `validate_sql` usa `node-sql-parser` (dialecto PostgresQL) + chequeo de keywords prohibidas sobre texto crudo + whitelist de tablas (`events`, `activities`, `conversations`, `messages`) + `LIMIT` obligatorio. No se auto-inyecta `LIMIT` — el modelo aprende el requisito via rechazo.
- Si la validación falla, el router salta directo a `summarize_result` que explica el problema al admin en lenguaje amigable en vez de tirar 500.
- `execute_sql` usa `ds.query()` raw con un cap adicional de 100 filas post-query (defensa en profundidad).

**Por qué validar antes en vez de confiar en read-only role**: la validación estática **explica qué pasó** al admin (un error de permisos de Postgres sería críptico), bloquea queries sintácticamente válidas pero fuera de scope (ej: SELECT sobre `activity_chunks`), y permite que el grafo desvíe el flujo a un mensaje útil.

**Logging**: scope `agent:admin-sql` en los nodos, `api:chat-admin` en la route — cada SQL generado se loguea con preview y el tiempo de ejecución queda medido con `log.time()`. Validaciones fallidas quedan en `warn` para detectar drift del LLM.

Ver detalle completo en `docs/INFORME_TP.md` §8.

### 4.12. Data Augmentation del formulario de alta con LLM + web grounding

**Contexto**: el corpus de `activities` lo carga el admin a mano. Descripciones pobres indexan pobre en pgvector → el agente cliente (Módulo B) no encuentra actividades que son match por contenido pero no por texto.

**Decisión**: un grafo LangGraph de 4 nodos (`extract_context` → `web_research` → `synthesize` → `emit_response`) disparado por un botón *"Aumentar con IA"* al lado de Crear/Actualizar en `ActivityForm`. El grafo combina un LLM estructurado (extrae lugar + tipo de actividad) con Tavily (web grounding) y un segundo LLM que reescribe los campos optimizando vocabulario para retrieval semántico (*retrieval-augmented writing*).

El admin ve la propuesta en una modal editable (fases en vivo vía SSE, fuentes consultadas, `ragNotes` explicando qué se optimizó). Acepta, edita o cancela. **Ningún campo se pisa en silencio**.

**Query Tavily adaptativa por tipo de actividad**: el sufijo `"altitud, dificultad, paisaje, clima"` que estaba hardcoded sesgaba al estilo trekking aunque la actividad fuese una bodega. El nodo `web_research` arma ahora la query con `placeName + activityType + keywords del extract_context + foco temático` derivado de un mapeo regex `FOCUS_BY_TYPE` (bodega → "varietales, degustación, gastronomía local"; trekking → "altitud, dificultad, ruta, equipo"; museo → "historia, exhibiciones, horarios"; etc.) + bloque fijo `"ubicación coordenadas geográficas dirección"` para grounding de coords. `searchDepth: "advanced"` (admin-facing, no time-critical, costo Tavily despreciable para volumen TP). `tavilySearch` ahora expone `sources[].snippet` (content crudo) además del `answer`, y soporta `includeDomains`/`excludeDomains`.

**Snippets crudos en synthesize**: el `webContext` que se pasa al segundo LLM ahora es `{answer, snippets[]}` en lugar de un string plano — los datos duros (horarios, dirección, coordenadas) suelen venir en los snippets, no en el resumen. Cap 600 chars por snippet × 3 fuentes + 1500 chars de answer ≈ 3300 chars de contexto web.

**Por qué no tocar todo**: `title`, `priceArs`, fechas, `imageUrl`, `isActive` son decisiones del admin — el grafo solo aumenta `description`, `requirements`, `physicalPrep`, `altitudeM`, `elevationGainM`, `suggestedLat`, `suggestedLng` (los últimos cuatro solo con grounding web confirmado — nunca alucinados; lat/lng llegan a la modal como sección "Coordenadas sugeridas" con toggle, y el form padre sólo aplica el par si el admin no cargó coords manualmente).

**Logging**: scope `agent:augment` en los nodos, `api:augment` en la route. Singleton del grafo en `globalThis.__augmentGraph` con invalidación HMR (mismo patrón que customer/admin-sql).

Ver detalle completo en `docs/INFORME_TP.md` §12.

### 4.13. Recurrencia de actividades con availability materializada

Las actividades soportan tres modalidades temporales: **one-time** (`recurrence = null`), **weekly** (`{kind:"weekly", days, startTime, endTime}`), y **dates** (`{kind:"dates", dates, startTime, endTime}`). Al crear/editar, el service expande el patrón a un array `available_dates date[]` (índice GIN), horizonte 180 días, cap 365 fechas. El retrieve filtra con `= ANY(available_dates)` (fecha exacta) o `&& ARRAY(generate_series...)` (rango) — queries O(log n) con índice, agente agnóstico del patrón. El `extract_intent` del Módulo B extrae `targetDate` o `dateRangeStart/dateRangeEnd` según el mensaje. La ingesta RAG agrega una línea del horario en español al texto embebido para soportar match semántico de expresiones temporales.

Ver detalle en `docs/INFORME_TP.md` §4.13.

## 5. Estructura de carpetas

```
.
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── package.json
├── .claude/
│   └── ARCHITECTURE.md           ← este documento
├── docker/
│   └── postgres/
│       └── init.sql              ← CREATE EXTENSION vector
├── public/
│   └── uploads/                  ← imágenes (volumen docker)
├── scripts/
│   └── seed.ts                   ← (pendiente) datos de prueba
└── src/
    ├── app/                      ← Next.js App Router
    │   ├── layout.tsx
    │   ├── page.tsx              ← chat del cliente
    │   ├── globals.css
    │   ├── admin/                ← área protegida (Auth.js)
    │   │   ├── activities/       ← CRUD actividades
    │   │   │   ├── new/
    │   │   │   └── [id]/
    │   │   └── dashboard/        ← UI del text-to-SQL
    │   └── api/
    │       ├── chat/
    │       │   ├── customer/route.ts   ← Módulo B
    │       │   └── admin/route.ts      ← Módulo D
    │       ├── activities/
    │       │   ├── route.ts            ← GET list, POST create
    │       │   └── [id]/route.ts       ← PUT, DELETE
    │       └── events/route.ts         ← Módulo C ingest
    │
    ├── agents/                   ← LangGraph — sin dependencias de Next
    │   ├── router/               ← (opcional) sub-ruteadores por grafo
    │   ├── customer/             ← Módulo B
    │   ├── admin-sql/            ← Módulo D
    │   └── shared/               ← cliente Anthropic, schemas comunes
    │
    ├── rag/                      ← Módulo A (motor)
    │                               ingest / retrieve / embeddings
    │
    ├── db/                       ← TypeORM — sin dependencias de Next
    │   ├── data-source.ts        ← DataSource con entidades explícitas
    │   ├── entities/             ← Activity, ActivityChunk, Event, Conversation
    │   └── migrations/
    │
    ├── lib/
    │   ├── analytics/            ← Módulo C: track (cliente) + persist (server)
    │   ├── auth.ts               ← Auth.js
    │   └── utils.ts
    │
    └── components/
        ├── chat/                 ← ChatWindow (useChat de AI SDK)
        ├── activities/           ← ActivityForm
        └── ui/                   ← shadcn
```

## 6. Docker Compose

Dos servicios:

- **`web`**: Next.js en modo producción (multi-stage build).
- **`db`**: `pgvector/pgvector:pg16`, con `init.sql` que habilita la extensión `vector`. Healthcheck con `pg_isready`.

Imágenes subidas vía formulario se persisten en `public/uploads/` a través de un volumen montado.

## 7. Próximos pasos

1. ~~**Entidades TypeORM** — `Activity`, `ActivityChunk` (con columna `vector(N)`), `Event`, `Conversation`.~~ ✅
2. ~~**Schemas Zod** para entradas/salidas de agentes y formularios.~~ ✅
3. ~~**Grafo mínimo** del agente cliente: extraer preferencias → buscar RAG → rankear 3 → refinar.~~ ✅ (Módulo B con input/output guardrails + CRAG)
4. ~~**Grafo mínimo** del agente admin: parsear pregunta → generar SQL → validar → ejecutar → resumir.~~ ✅ (Módulo D)
5. ~~**Formulario de alta de actividades** + pipeline de ingesta RAG.~~ ✅
6. **Auth.js** para proteger `/admin/*` y `/api/chat/admin` — pendiente (fuera de scope del TP por decisión, ver `docs/INFORME_TP.md` §2).
7. ~~**Seed de actividades** para demo reproducible.~~ ✅ (`scripts/seed.ts` + `npm run seed`)
8. **Diagramas Mermaid** de los grafos (LangGraph ofrece `graph.getGraph().drawMermaid()`).
