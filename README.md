# TP DUIA — Sistema Inteligente de Gestión y Venta para Agencia de Turismo

Plataforma full-stack para una agencia de turismo aventura: catálogo RAG, chat conversacional para clientes, tracking de eventos y dashboard administrativo en lenguaje natural (text-to-SQL).

## Características

- **Módulo A — Admin RAG**: alta de actividades con formulario estructurado y pipeline de ingesta que chunkea, embebe y guarda en pgvector para búsqueda semántica.
- **Módulo B — Agente cliente**: grafo LangGraph con guardrails input/output, extracción de intención, retrieval híbrido (RAG + filtros SQL), evaluación CRAG y ranking adaptativo de 3 propuestas.
- **Módulo C — Analítica**: captura de eventos frontend (page views, clicks, conversiones) y backend (turnos del grafo, guardrails bloqueados) sobre una única tabla `events` con `jsonb` payload.
- **Módulo D — Dashboard text-to-SQL**: agente admin que traduce preguntas en español a SQL validado estáticamente (parser + whitelist + LIMIT obligatorio) y resume los resultados.

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 20+ |
| Framework | Next.js 15 (App Router, React 19) |
| LLM provider | Intercambiable vía `LLM_PROVIDER`: Gemini 2.0 Flash / Groq Llama 3.3 70B / Ollama (local CPU o remoto con GPU). Ver [`docs/LLM_MODELS_JOURNEY.md`](docs/LLM_MODELS_JOURNEY.md). |
| Orquestación | LangGraph.js + Vercel AI SDK (streaming UI) |
| DB | PostgreSQL 16 + pgvector (una sola base para RAG, analytics, catálogo) |
| ORM | TypeORM con migración inicial y `migrationsRun: true` |
| Embeddings | Transformers.js + `multilingual-e5-small` (384 dim, local) |

Detalle completo y justificaciones en [`docs/INFORME_TP.md` §3](docs/INFORME_TP.md).

## Quickstart (Docker Compose)

**Prerrequisitos**: Docker + Docker Compose.

```bash
cp .env.example .env
```

Dos caminos con peso igual — elegí según infra disponible. Ambos levantan la misma app; solo cambia el proveedor del LLM.

### Camino A — Gemini cloud

Ideal si no tenés infraestructura propia. Signup en 30 segundos, free tier cubre demo y desarrollo.

1. Signup gratis en [aistudio.google.com](https://aistudio.google.com) → **Get API key**.
2. Signup en [tavily.com](https://tavily.com) para búsqueda web (free tier 1000 req/mes).
3. Editá `.env`:
   ```
   LLM_PROVIDER=gemini
   GOOGLE_API_KEY=tu_key_acá
   GEMINI_MODEL=gemini-2.0-flash
   TAVILY_API_KEY=tu_key_acá
   ```
4. Levantá la app:
   ```bash
   docker compose up
   ```

### Camino B — Ollama remoto con GPU

Ideal si tenés un servidor con GPU NVIDIA (CUDA). Usamos este setup para el modelo `ministral-3:14b` — tool calling estable y sin costo por request.

Requiere un servidor con GPU preparado (drivers NVIDIA + CUDA + Ollama). Guía completa en [**`docs/OLLAMA_REMOTE_SETUP.md`**](docs/OLLAMA_REMOTE_SETUP.md).

1. Seguí la guía del server remoto → pulleá `ministral-3:14b` → exponé el puerto 11434.
2. Editá `.env` de la app:
   ```
   LLM_PROVIDER=ollama
   OLLAMA_BASE_URL=http://<IP-del-servidor>:11434
   OLLAMA_MODEL=ministral-3:14b
   TAVILY_API_KEY=tu_key_acá
   ```
3. Levantá la app:
   ```bash
   docker compose up
   ```

### Otras opciones

- **Groq cloud** (Llama 3.3 70B): `LLM_PROVIDER=groq` + `GROQ_API_KEY` de [console.groq.com](https://console.groq.com). Soportado pero no default — ver contexto histórico en [`docs/LLM_MODELS_JOURNEY.md`](docs/LLM_MODELS_JOURNEY.md) §Fase 2.
- **Ollama local (CPU, sin GPU)**: corré con `docker compose --profile ollama up` + `docker compose exec ollama ollama pull qwen2.5-coder:7b`. Setear `OLLAMA_BASE_URL=http://ollama:11434` y `OLLAMA_MODEL=qwen2.5-coder:7b`. Tool calling menos consistente — ver [`docs/OLLAMA_MODELS.md`](docs/OLLAMA_MODELS.md).

### Seed de datos de demo

Una vez que `docker compose up` levantó la stack y la DB aplicó las migrations, cargá las 15 actividades de ejemplo (mezcla de one-time + weekly + dates recurring) corriendo el seed **dentro del contenedor web**:

```bash
docker compose exec web npm run seed
```

La primera corrida demora ~30-60s porque baja el modelo de embeddings `Xenova/multilingual-e5-small` desde HuggingFace (~120MB) para indexar las actividades en pgvector. Es idempotente: si volvés a correrlo, skipea las actividades que ya existen por título.

Abrí http://localhost:3000 — chat del cliente. Admin en http://localhost:3000/admin/activities y http://localhost:3000/admin/dashboard.

**Reset desde cero** (wipe de actividades + chats + eventos):

```bash
docker compose exec db psql -U duia -d duia -c "
  TRUNCATE activities, activity_chunks, conversations, messages, events RESTART IDENTITY CASCADE;
"
docker compose exec web npm run seed
```

**Alternativa desde el host** (si ya tenés Node 20+ y `npm install` corrido localmente): asegurate que `.env` tenga `DATABASE_URL=postgres://duia:duia@localhost:5432/duia` y corré `npm run seed` directamente. Útil para iterar sobre `scripts/seed.ts` sin rebuildear la imagen.

## Estructura del repo

```
.
├── docker-compose.yml
├── .env.example
├── docs/                       # documentación académica + referencias
├── docker/postgres/init.sql    # CREATE EXTENSION vector
├── scripts/seed.ts             # datos de demo
└── src/
    ├── app/                    # Next.js App Router (UI + API routes)
    │   ├── page.tsx            # chat cliente
    │   ├── admin/              # activities + dashboard text-to-SQL
    │   └── api/                # /chat/customer, /chat/admin, /activities, /events
    ├── agents/                 # grafos LangGraph (sin dependencias de Next)
    │   ├── customer/           # Módulo B
    │   ├── admin-sql/          # Módulo D
    │   └── shared/             # createLLM() factory, Tavily
    ├── rag/                    # Módulo A (ingest + retrieve + embeddings)
    ├── db/                     # TypeORM (entidades + migraciones)
    ├── lib/analytics/          # Módulo C (track + persist)
    └── components/
```

## Documentación extendida

- [`docs/INFORME_TP.md`](docs/INFORME_TP.md) — informe académico completo: objetivo, alcance, stack justificado, decisiones numeradas (Contexto → Decisión → Alternativa → Razón), descripción detallada por módulo, schema de DB, patrones referenciados (CRAG, hybrid retrieval, guardrails).
- [`docs/ANALYTICS_SCHEMA.md`](docs/ANALYTICS_SCHEMA.md) — schema card del agente text-to-SQL: catálogo de event types, estructura de cada `payload`, enums, 15+ queries NL→SQL de ejemplo.
- [`docs/LLM_MODELS_JOURNEY.md`](docs/LLM_MODELS_JOURNEY.md) — historia de las 8 iteraciones de selección de modelo (Gemini → Groq → Gemma → qwen2.5 → coder → qwen3 → qwen3-nothink → ministral-3), defensa académica de la arquitectura defensiva construida alrededor de los fallos.
- [`docs/OLLAMA_REMOTE_SETUP.md`](docs/OLLAMA_REMOTE_SETUP.md) — guía de infraestructura: cómo correr Ollama en un servidor Proxmox con GPU NVIDIA (CUDA) y apuntar la app. Requerido para el Camino B del Quickstart.
- [`docs/OLLAMA_MODELS.md`](docs/OLLAMA_MODELS.md) — referencia rápida de modelos locales con trade-offs (disco, RAM/VRAM, tool calling, español).
- [`docs/AGENT_FLOWS.md`](docs/AGENT_FLOWS.md) — diagramas Mermaid de los 3 grafos LangGraph (customer, admin-sql, augment-activity) con descripción nodo-por-nodo. Pensado para visualización rápida en defensa/demo.
- [`.claude/ARCHITECTURE.md`](.claude/ARCHITECTURE.md) — referencia técnica para implementadores: decisiones vigentes con razón breve, estructura de carpetas, caveats de TypeORM + Next.js + pgvector.

## Flujos de demostración

Cuatro escenarios para validar cada módulo después del seed:

1. **Módulo A (RAG admin)** — Entrar a http://localhost:3000/admin/activities y ver el catálogo cargado. Crear una actividad nueva desde el formulario para disparar la re-ingesta vectorial.
2. **Módulo B (chat cliente)** — En http://localhost:3000, probar con *"trekking tranquilo en Bariloche"* (query con contexto) o *"Sierra de la Ventana"* (solo topónimo — dispara enrichment Tavily proactivo). Observar las fases del grafo en vivo.
3. **Módulo C (tracking)** — Después de interactuar con el chat y hacer click en una propuesta, verificar en la DB: `SELECT event_type, count(*) FROM events GROUP BY event_type;`.
4. **Módulo D (dashboard)** — Entrar a http://localhost:3000/admin/dashboard y preguntar *"¿cuál es la actividad más clickeada?"*, *"¿qué % de turnos no encuentran match?"* o *"¿qué lugares piden más los usuarios?"*. Ver la SQL generada en el bloque colapsable de cada respuesta.

## Fuera de alcance

Por tratarse de un TP académico se declaran explícitamente fuera del scope:

- Autenticación y autorización (admin abierto).
- Hardening de seguridad (rate limiting, CSRF, auditoría).
- Gestión avanzada de imágenes (CDN, resizing, GC de huérfanos).
- Tests automatizados.

Detalle y justificación en [`docs/INFORME_TP.md` §2](docs/INFORME_TP.md).

## Créditos

Juan Francisco Herrero — Trabajo Práctico Final de la Diplomatura Universitaria en Inteligencia Artificial (DUIA) — 2026.
