# Arquitectura — TP DUIA

> Sistema Inteligente de Gestión y Venta para Agencia de Turismo.
> Documento vivo. Actualizar cuando cambien decisiones.

**Estado**: scaffolding inicial (2026-04-19).

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
| Orquestación LLM | **LangGraph.js** (`@langchain/langgraph` + `@langchain/anthropic`) |
| Streaming UI | Vercel AI SDK (`ai` + `@ai-sdk/react` + `@ai-sdk/anthropic`) |
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

### 4.6. Agencia única (single-tenant)

No hay `organizationId` propagado por tablas. Si a futuro se requiere multi-tenant, migración explícita.

### 4.7. Ingesta de actividades via formulario estructurado

Campos: título, descripción, imagen, horarios, requisitos, preparación física, altitud, desnivel, etc. No hay parseo de PDFs ni texto libre — el pipeline de ingesta RAG concatena campos relevantes → chunkea → embedea → guarda en `activity_chunks` (pgvector).

### 4.8. Sin tests por ahora

Se omite Vitest/testing framework en la fase inicial. Agregar cuando haya flujos estables que valga la pena proteger de regresiones.

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

1. **Entidades TypeORM** — `Activity`, `ActivityChunk` (con columna `vector(N)`), `Event`, `Conversation`.
2. **Schemas Zod** para entradas/salidas de agentes y formularios.
3. **Grafo mínimo** del agente cliente: extraer preferencias → buscar RAG → rankear 3 → refinar.
4. **Grafo mínimo** del agente admin: parsear pregunta → generar SQL → validar → ejecutar → resumir.
5. **Formulario de alta de actividades** + pipeline de ingesta RAG.
6. **Auth.js** para proteger `/admin/*` y `/api/chat/admin`.
