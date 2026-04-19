# Informe del Trabajo Práctico

## Sistema Inteligente de Gestión y Venta para Agencia de Turismo


## 1. Objetivo

El sistema propone una plataforma integral para una agencia de turismo que combina:

- **Gestión administrativa** del catálogo de actividades con búsqueda semántica (RAG).
- **Interfaz conversacional inteligente** para el cliente que descubre, rankea y refina propuestas.
- **Captura de eventos** de comportamiento en la interfaz para analítica.
- **Dashboard en lenguaje natural** para el administrador con traducción automática a SQL (text-to-SQL).

Los cuatro módulos funcionales se exponen mediante dos interfaces de chat separadas (una por rol) y una interfaz administrativa tradicional.

---

## 2. Alcance

### Dentro del alcance
- Interfaz web completa (chat cliente, chat admin, formulario de alta de actividades, listado).
- Despliegue reproducible mediante Docker Compose.
- Persistencia en base de datos relacional con soporte vectorial.

### Fuera del alcance
- **Autenticación y autorización**: por tratarse de un TP académico, el admin es abierto.
- **Hardening de seguridad**: no se aplican rate limiting, CSRF, sanitización avanzada más allá de Zod, ni auditoría.
- **Gestión avanzada de imágenes**: sin CDN, resizing, ni garbage collection de archivos huérfanos.
- **Tests automatizados**: se privilegia la velocidad de desarrollo del prototipo.

Estas omisiones son conscientes y están documentadas para que no sean confundidas con oversights.

---

## 3. Stack tecnológico

| Capa | Elección | Justificación |
|---|---|---|
| Runtime | **Node.js 20+** | Ecosistema rico para I/O asíncrono (LLM, DB, embeddings). Preferencia del equipo por JavaScript/TypeScript. |
| Framework | **Next.js 15 (App Router)** | Unifica frontend y backend en un monorepo. La lógica de dominio (agentes, RAG, ORM) vive en módulos aislados y puede extraerse a un backend dedicado sin reescritura. |
| Lenguaje | **TypeScript** | Tipado estático, integración con Zod para validación en bordes, mejor DX para refactors. |
| Orquestación LLM | **LangGraph.js** | Modelo explícito de grafo con estado, nodos y transiciones condicionales. Supera a LangChain para flujos con ciclos (refinamiento iterativo, self-correction). El grafo se presenta visualmente en la defensa del TP. |
| Streaming UI | **Vercel AI SDK** | Integración directa con React (`useChat`) para streaming token-a-token. No orquesta; solo transporta. |
| Proveedor LLM | **Intercambiable — 3 capas de fallback** (Gemini 2.0 Flash default / Groq Llama 3.3 70B / Ollama local `qwen2.5:7b-instruct`) | Los dos primeros son free tiers cloud; Ollama corre local y sirve como fallback cuando se agotan los cuotas o no hay internet. Selección por env var `LLM_PROVIDER`. La abstracción en `src/agents/shared/llm.ts` concentra toda la instanciación — cambiar de proveedor es un restart. Ver §4.5 sobre la migración real y §4.5.2 sobre el fallback local. |
| DB relacional | **PostgreSQL 16** | Madura, soporte JSONB, extensiones. |
| DB vectorial | **pgvector** | Extensión que agrega el tipo `vector` e índices HNSW. Evita introducir una DB separada (Pinecone, Qdrant). Una sola DB cubre RAG, analítica, conversaciones y catálogo. |
| ORM | **TypeORM** | Familiaridad del equipo. Decoradores en TS, migraciones, repos. Compone bien con Postgres. |
| Embeddings | **Transformers.js + `multilingual-e5-small` (384 dim)** | Corre localmente en Node sin API externa. Cero fricción para el evaluador. El modelo está entrenado para español y rinde bien para el caso de uso. |
| Validación | **Zod** | Schemas compartidos entre UI y API. Genera tipos TS automáticamente. |
| Búsqueda web | **Tavily** | API diseñada específicamente para agentes LLM — devuelve texto extraído listo para consumir. Free tier 1000 req/mes, suficiente para TP. |
| Estilos | **Tailwind CSS** | Velocidad de iteración, ningún CSS custom excepto utilities. |
| Empaquetado | **Docker Compose** | Entrega en una sola máquina (`docker compose up` y listo). El evaluador no instala dependencias. |

---

## 4. Decisiones de diseño

Las decisiones se numeran para referencia rápida. Cada una incluye contexto, alternativas consideradas y razón del descarte.

### 4.1 Embeddings locales en lugar de API

**Contexto**: el módulo RAG requiere generar embeddings para indexación y consulta.

**Decisión**: ejecutar el modelo `multilingual-e5-small` dentro del proceso Node vía Transformers.js.

**Alternativas consideradas**: Voyage AI, OpenAI `text-embedding-3-small`, Cohere embed-v3.

**Razón**: el TP se entrega como Docker Compose ejecutable por el evaluador sin configuración. Cualquier API externa requeriría alta previa + gestión de clave. El modelo local se descarga en la primera ejecución (≈50MB) y queda cacheado. La calidad de `multilingual-e5-small` es suficiente para el caso de uso (descripciones en español de actividades turísticas). La capa `src/rag/embeddings.ts` oculta el proveedor — el upgrade a una API de mayor calidad es una modificación local si fuera necesario en producción.

### 4.2 PostgreSQL + pgvector como única base

**Contexto**: el sistema requiere almacenamiento vectorial (RAG) y relacional (analítica, catálogo, conversaciones).

**Decisión**: usar Postgres con la extensión pgvector para ambos usos.

**Alternativa descartada**: base vectorial dedicada (Pinecone, Qdrant, Chroma).

**Razón**: una sola base reduce la superficie operativa y permite queries mixtas (vector + SQL) sin federación. Particularmente relevante porque el módulo D (text-to-SQL) opera sobre la misma base — mantener eventos y catálogo en el mismo motor simplifica su implementación. pgvector soporta índices HNSW con performance competitiva para corpus de tamaño razonable.

### 4.3 Schema gestionado por migración inicial + `migrationsRun: true`

**Contexto**: TypeORM ofrece `synchronize: true` para auto-generar el schema desde las entidades en cada arranque.

**Decisión**: desactivar `synchronize`, usar una migración inicial manual, y habilitar `migrationsRun: true` para que TypeORM aplique migraciones pendientes al inicializar.

**Alternativa descartada**: `synchronize: true`.

**Razón**: TypeORM no conoce el tipo `vector` de pgvector. Con `synchronize:true`:
- Si la entidad declara `@Column({ type: 'vector' })` → error (tipo desconocido).
- Si la entidad declara la columna como `text` y se altera manualmente post-sync → en el próximo arranque synchronize detecta "text declarado vs vector en DB" y la revierte, destruyendo el índice HNSW.

La migración explícita define `vector(384)` directamente en el CREATE TABLE y crea el índice `hnsw (embedding vector_cosine_ops)`. `migrationsRun: true` conserva la UX de "arrancar y listo" sin el conflicto.

### 4.4 Abstracción del proveedor LLM — 3 capas de fallback

**Decisión**: concentrar toda la instanciación de clientes LLM en un único archivo (`src/agents/shared/llm.ts`), detrás de una fábrica `createLLM()` que resuelve el backend concreto en runtime según la env var `LLM_PROVIDER`.

**Tres providers soportados** (`groq` | `gemini` | `ollama`):

| Provider | Modelo default | Rol | Requisito infra |
|---|---|---|---|
| `gemini` | `gemini-2.0-flash` | Default — free tier generoso, multimodal | API key de Google AI Studio |
| `groq` | `llama-3.3-70b-versatile` | Fallback cloud — inferencia muy rápida | API key de Groq |
| `ollama` | `qwen2.5:7b-instruct` | Fallback local — offline, privado | Daemon Ollama en `localhost:11434` |

Ningún otro archivo del proyecto importa `ChatGroq`, `ChatGoogleGenerativeAI` o `ChatOllama`. Los nodos del grafo, los servicios y los endpoints consumen solo `createLLM()`. Cambiar de backend es un flip de env var + restart — **los prompts, el grafo, los schemas y los tests (cuando existan) no cambian**.

**Por qué es académicamente relevante**: aplicación concreta del *single responsibility principle* y *dependency inversion* sobre una dependencia externa volátil. En un sistema real los proveedores LLM fallan, se encarecen, rotan condiciones de servicio o se restringen — el diseño debe permitir cambiarlos sin cirugía. El costo de mantener la abstracción es trivial (≈80 LOC); el beneficio se vio en la práctica (§4.5.1, §4.5.2).

### 4.4.0 Historia completa del viaje de modelos

El proyecto pasó por **7 iteraciones** de selección de modelo hasta llegar al stack final. Cada una reveló limitaciones técnicas (function calling no habilitado, thinking mode, coder bias) que moldearon la arquitectura defensiva.

**Documento dedicado**: `docs/LLM_MODELS_JOURNEY.md` — narrativa completa con:
- Por qué Gemma falló (no soporta function calling).
- Por qué qwen2.5-coder rompe tool calling paradójicamente (bias a markdown).
- Por qué thinking models (qwen3 default, Nemotron Nano) rompen el grafo (latencia, parser confusion, modelo "olvida" la tool call después del razonamiento).
- Mecanismos defensivos construidos (doble-path `invokeStructured`, retry automático, strip de `<think>`, defaults Zod con `.nullish()`, zod-to-json-schema en el fallback).
- Stack final: Ollama + `ministral-3:14b`.

Este documento evidencia iteración real sobre un problema de producción — útil para la defensa del TP.

### 4.4.1 Caso real de provider swap (Groq → Gemini)

**Historia** (2026-04-19): durante testing del Módulo B, Groq restringió la cuenta del desarrollador sin aviso previo (respuesta HTTP 400 con `code: "organization_restricted"`). El agente entero quedó inoperable.

**Resolución**: dado que desde el scaffolding inicial toda la instanciación del LLM se concentraba en un único archivo (`src/agents/shared/llm.ts`) detrás de la función `createLLM()`, el swap tomó ≈5 minutos:

1. Se agregó `@langchain/google-genai` al `package.json`.
2. Se refactorizó `createLLM()` para elegir provider por env var `LLM_PROVIDER` (`groq` | `gemini`).
3. Se agregaron variables `GOOGLE_API_KEY` y `GEMINI_MODEL` al `.env.example` y `docker-compose.yml`.
4. Flip de `LLM_PROVIDER=gemini` y restart.

Ningún nodo del grafo, ningún test, ningún prompt tuvo que cambiar. El caso valida la decisión de abstracción del proveedor tomada en §4.5.

**Por qué es académicamente relevante**: muestra el beneficio concreto del *single responsibility principle* aplicado a dependencias externas. En un sistema real los proveedores fallan, se encarecen, o se vuelven restrictivos — el diseño debe permitir cambiarlos sin cirugía.

### 4.4.2 Ollama como tercera capa — fallback local offline

**Contexto**: los free tiers de Gemini y Groq tienen cuotas (TPM, RPM, tokens/día) que se agotan durante sesiones intensivas de desarrollo o demo. Además, algunos escenarios (viajes, red corporativa restringida, presentación sin internet confiable) requieren correr el sistema sin depender de APIs externas.

**Decisión**: agregar **Ollama** como tercer provider. Ollama es un runtime para LLMs cuantizados que corre local — el daemon escucha en `http://localhost:11434` y expone una API compatible con OpenAI. La integración se hace vía `@langchain/ollama` (`ChatOllama`), siguiendo el mismo patrón uniforme que los otros dos providers.

**Infraestructura opcional**: el `docker-compose.yml` incluye un service `ollama` bajo un Docker Compose profile (`profiles: ["ollama"]`). No arranca por default — solo con `docker compose --profile ollama up`. Esto evita descargar una imagen de varios GB al evaluador que solo quiere probar con Gemini. Cuando se levanta con el profile, la URL del service pasa a ser `http://ollama:11434` (red interna de compose), no `localhost`.

**Valor del diseño — 3 providers = 3 capas de fallback**:

```
LLM_PROVIDER=gemini   →  Gemini cloud (default)
                         ↓ (si cuota agotada o cuenta bloqueada)
LLM_PROVIDER=groq     →  Groq cloud (fallback 1)
                         ↓ (si free tier exhausted o Groq nos banea otra vez)
LLM_PROVIDER=ollama   →  Ollama local (fallback 2 — último recurso, offline)
```

Cada capa se activa con un solo cambio de env var. Ningún código aplicación cambia. Esto materializa visiblemente el desacoplamiento del proveedor que defendemos en §4.5 — no es un principio abstracto, es una garantía operacional concreta que sobrevivió tanto a un ban en producción como a la necesidad de operar offline.

### 4.4.3 Elección del modelo local default

Entre los candidatos lightweight evaluados (`qwen2.5:7b-instruct`, `qwen2.5:3b-instruct`, `llama3.2:3b`, `mistral:7b`, `phi3:mini`):

| Modelo | Tool calling | Español | RAM | Elegido |
|---|---|---|---|---|
| `qwen2.5:7b-instruct` | Bueno — entrenado con function calling nativo | Muy bueno — Qwen 2.5 tiene data multilingüe fuerte | ~8GB | **Default** |
| `qwen2.5:3b-instruct` | Aceptable — a veces falla en schemas complejos | Bueno | ~3GB | Alternativa lightweight |
| `llama3.2:3b` | Débil en schemas anidados — formato drift | Aceptable pero sesgado al inglés | ~3GB | Descartado |
| `mistral:7b` | Muy flojo en tool calling estructurado | Bueno | ~5GB | Descartado (deal-breaker: tool calling) |
| `phi3:mini` | Variable, orientado a razonamiento corto | Regular — Phi es anglocéntrico | ~2GB | Descartado |

**Razón de `qwen2.5:7b-instruct` como default**: el proyecto usa `withStructuredOutput` en casi todos los nodos del grafo (`extract_intent`, `evaluate_match`, `guardrail_*`) — tool calling robusto es un requisito duro, no un nice-to-have. Qwen 2.5 lidera entre los <10GB en este eje, especialmente versus Mistral y Llama 3.2 3B. Sumado a su data multilingüe, es la opción dominante para un proyecto en español con schemas estructurados.

### 4.5 Logging estructurado propio

**Contexto**: durante desarrollo se necesita seguir el flujo de la app desde la terminal (qué servicio fue invocado, cuánto tardó un embedding, qué resultados retornó retrieve).

**Decisión**: implementar un logger custom en `src/lib/logger.ts` con scopes jerárquicos (`rag:embed`, `svc:activity`, `agent:customer`), niveles (`debug`/`info`/`warn`/`error`) y helper `time()` para medición.

**Alternativas descartadas**: `pino`, `winston`, `console.log`.

**Razón**: el alcance del TP no justifica la complejidad de pino (formato JSON, transports, child loggers reflexivos). Un logger propio de ≈60 líneas cubre 100% del uso y el código es auditable en la defensa. El patrón se documenta en `.claude/skills/logging/SKILL.md` para mantener consistencia a medida que se agregan módulos.

### 4.6 Búsqueda web via Tavily con retry limitado

**Contexto**: el agente cliente debe manejar dos tipos de input — descripciones ("algo tranquilo, presupuesto 50k") y nombres de lugares ("Sierra de la Ventana"). Los segundos no tienen vocabulario semántico rico para buscar en el corpus.

**Decisión**: integrar Tavily como herramienta de enriquecimiento. Se dispara en dos situaciones:
1. **Proactivo**: el usuario proporciona solo un nombre de lugar (sin más contexto). Se enriquece ANTES de retrieve.
2. **Reactivo (CRAG)**: el evaluador LLM determina que los resultados del RAG son de baja relevancia. Se enriquece y se re-ejecuta retrieve.

**Límite de retries**: máximo 1 retry reactivo, para evitar loops y consumo innecesario del free tier de Tavily.

**Alternativas**: DuckDuckGo (gratis sin key, pero menos estructurado), Google CSE (100 req/día, requiere dos keys), Brave Search (2000/mes).

**Razón de Tavily**: API diseñada para agentes — devuelve texto limpio extraído, no solo snippets. DX óptima, 1000 req/mes cubre desarrollo y demo del TP.

### 4.7 Recurrencia de actividades con availability materializada

**Contexto**: el catálogo mezcla tres tipos de actividades. Unas son eventos *one-time* (una fecha única, p. ej. un trekking al Chaltén el 15/3). Otras son ofertas recurrentes (*"kayak todos los sábados y domingos de 9 a 16, entre noviembre y marzo"*). Y otras corren en un conjunto discreto de fechas puntuales (*"workshop de fotografía el 15, 22 y 29 de noviembre"*). El agente cliente (Módulo B) tiene que poder responder *"¿qué puedo hacer el sábado 22 de noviembre?"* filtrando correctamente en las tres modalidades.

**Alternativas consideradas**:

1. **RRULE interpretado en runtime** (iCalendar style). Guardamos un patrón compacto (RRULE:FREQ=WEEKLY;BYDAY=SA,SU;DTSTART=...). Al consultar, el agente o un helper expanden el patrón contra la fecha pedida. Ventaja: un solo campo, expresivo. Desventaja: cada query requiere evaluar el patrón en código — el LLM (text-to-SQL del Módulo D) o el retrieve del cliente no pueden filtrar en SQL puro; habría que cargar todas las actividades activas y filtrar app-side, rompiendo el índice. Además, RRULE es parte del estándar iCal — sobre-ingeniería para tres kinds.
2. **Materialización de availability al escribir**. Guardamos el patrón (`recurrence jsonb`, nullable = one-time) **y** expandimos la lista de fechas concretas a una columna `available_dates date[]` con índice GIN. Al crear o editar, el service corre `expandAvailableDates(recurrence, startDate, endDate)` y persiste ambas cosas.

**Decisión**: (2) materialización. El tradeoff: un pelito más de storage (≤365 dates por actividad, ~2KB peor caso) y una ligera complejidad al actualizar (si el admin cambia el patrón hay que re-expandir), a cambio de que el retrieve del cliente sea una query SQL pura con índice — `WHERE $date = ANY(available_dates)` o `available_dates && ARRAY(generate_series(...))::date[]`. Queries O(log n) con GIN, comportamiento idéntico para los tres kinds desde el punto de vista del consumidor, y lo más importante: **el agente no necesita entender recurrencia**. Solo extrae `targetDate` o `dateRangeStart+dateRangeEnd` del mensaje del usuario y arma el filtro. La complejidad se concentra en un único helper puro (`src/lib/recurrence/expand.ts`), testeable y con un cap explícito (365 fechas máximo por actividad, horizonte de 180 días desde hoy para patrones weekly). Es también el patrón industry-standard — Google Calendar y Microsoft Outlook usan la misma estrategia ("expand to instances" al escribir, buscar por instancia al leer).

**Cómo afecta al flujo cliente**:

- `extract_intent` del agente (prompt actualizado) extrae `targetDate` si el usuario menciona un día (*"el sábado 22 de noviembre"*) o el par `dateRangeStart/dateRangeEnd` si menciona un rango (*"la semana del 20 al 26"*).
- `retrieveActivities` mapea estos a SQL: `= ANY(available_dates)` para fecha exacta, `&&` contra un rango expandido para overlap.
- La ingesta RAG (`buildActivityText`) agrega una línea en lenguaje natural al texto embebido — *"Se realiza todos los sábados y domingos de 9:00 a 16:00, disponible entre noviembre de 2026 y marzo de 2027"* — para que queries temporales también matcheen por semántica, no solo por filtro estructural.
- Back-compat: las filas existentes del seed (todas one-time) reciben `available_dates = [start_date::date]` via la migración, sin cambio de comportamiento.

**Shape del `recurrence` jsonb**:

```ts
null                                                             // one-time
{ kind: "weekly", days: ["sat","sun"], startTime: "09:00", endTime: "16:00" }
{ kind: "dates",  dates: ["2026-11-15","2026-11-22"], startTime: "10:00", endTime: "13:00" }
```

Los campos `startDate`/`endDate` de la actividad siguen existiendo: para `weekly` y `dates` actúan como rango de validez (*"entre qué y qué este patrón está disponible"*), y el helper `expandAvailableDates` clipa a ese rango + al horizonte de 180 días.

---

## 5. Módulo A — Administración RAG

### 5.1 Flujo de ingesta

Al crear o actualizar una actividad desde el formulario admin:

1. El formulario (client component) envía JSON validado con Zod a `POST /api/activities`.
2. `createActivity` persiste la actividad en la tabla `activities`.
3. Dispara `ingestActivity(id, data)` del módulo RAG.
4. El pipeline:
   - **Construye un texto etiquetado** concatenando los campos relevantes: Título, Descripción, Requisitos, Preparación física, Altitud, Desnivel. Esto da al embedding contexto estructural (`"Altitud máxima: 3000 metros"` se indexa distinto a `"3000"`).
   - **Chunkea** a 500 chars con 50 de overlap. Motivación: los modelos E5 tienen ventana efectiva de 512 tokens; 500 chars queda dentro. El overlap mitiga pérdida de contexto cuando una oración cruza el límite de chunk.
   - **Embebe** cada chunk con prefijo `passage:` (convención E5 para documentos indexados).
   - **Borra** los chunks previos del `activity_id` (idempotencia para updates — re-ingesta completa).
   - **Inserta** los nuevos chunks en `activity_chunks` con su embedding como `vector(384)`.

### 5.2 Retrieval híbrido

`retrieveActivities(query, topK, filters)` combina:

- **Semántica (RAG)**: operador `<=>` de pgvector (distancia coseno) sobre la query embebida con prefijo `query:`.
- **Estructural (SQL)**: filtros `WHERE a.price_ars <= ?`, `a.start_date >= ?`, `a.end_date <= ?`, `a.is_active = true`.

Se utiliza una CTE con `ROW_NUMBER() OVER (PARTITION BY activity_id ORDER BY distancia)` para deduplicar: cada actividad aparece una sola vez, representada por su chunk más cercano a la query. Esto evita que una actividad con 3 chunks muy similares acapare el top-K.

### 5.3 Justificación académica de RAG + SQL híbrido

RAG y SQL **no son alternativos sino complementarios**:

- SQL maneja **constraints duros** (precio, fechas, disponibilidad).
- RAG maneja **matching semántico** entre intención libre del usuario y texto descriptivo del corpus.

Ejemplo: el usuario dice *"algo tranquilo para mi abuela que no está en forma"*. No hay columna "tranquilo" en la DB. RAG busca en los embeddings de `requirements` + `physicalPrep` y encuentra actividades cuyo texto dice *"apto para principiantes sin experiencia, caminata suave"*. SQL con `LIKE` fallaría. Con RAG, la conversación puede ser natural.

---

## 6. Módulo B — Agente cliente

### 6.1 Arquitectura del grafo

Se modela como un `StateGraph` de LangGraph con 8 nodos y 3 transiciones condicionales:

```
START
  │
  ▼
[input_guard]       ── LLM: ¿el mensaje está en scope? (§6.7)
  │
  ▼
[route: inScope?]
  ├─ no ─────────────────▶ (respuesta de rechazo) ──▶ [emit_response]
  └─ sí
  │
  ▼
[extract_intent]    ── LLM con structured output (Zod)
  │
  ▼
[route: onlyPlace?]
  ├─ sí ──▶ [web_enrich] ──▶ (merge a semanticQuery)
  │                              │
  └─ no ─────────────────────────┤
                                 ▼
                         [rag_retrieve]   (función del Módulo A)
                                 │
                                 ▼
                         [evaluate_match]  ── LLM scorea cada candidato
                                 │
                                 ▼
             [route: anyStrong OR goodAvg OR retries exhausted]
                                 │
                   ┌─────────────┼─────────────┐
                   │ no                        │ sí
                   ▼                           ▼
             [web_enrich_retry]         [rank_and_explain] ── LLM adaptativo (§6.5)
             (loop → rag_retrieve)             │
                                               ▼
                                       [guardrail_check] ── LLM valida scope (§6.6)
                                               │
                                               ▼
                                         [emit_response]
                                               │
                                               ▼
                                              END
```

### 6.2 Estado (State)

```ts
type CustomerState = {
  messages: ChatMessage[];          // historial conversacional
  intent?: {
    semanticQuery: string;          // query limpia para RAG
    filters: RetrieveFilters;       // maxPriceArs, startAfter, endBefore
    placeNames: string[];           // topónimos detectados
    isOnlyPlace: boolean;           // ¿es solo un lugar sin otro contexto?
  };
  webContext?: string;              // texto enriquecido de Tavily
  candidates: ActivityHit[];        // resultados del RAG
  evaluation?: {
    id: string;
    relevance: number;              // 0..1
    reason: string;
  }[];
  avgScore?: number;
  webRetries: number;               // stop condition del loop
  ranked?: Proposal[];              // top 3 final
  response?: string;                // mensaje a streamear
};
```

### 6.3 Descripción y justificación por nodo

**`extract_intent`** — Invoca al LLM con structured output (Zod schema) sobre los últimos N mensajes + turno actual. Devuelve `{semanticQuery, filters, placeNames, isOnlyPlace}`.

*Por qué estructurado y no reescritura texto-a-texto*: la extracción estructurada es más robusta. Los filtros alimentan SQL (exactitud); el `semanticQuery` alimenta el embedding (flexibilidad). Pasar el historial habilita refinamiento conversacional ("más barato", "con menos altitud") — cumple el requisito del brief de "ajustar propuestas basándose en el feedback inmediato".

**`web_enrich`** — Solo si `isOnlyPlace = true`. Llama a Tavily con el/los nombres de lugar. Extrae altitud, dificultad, paisaje, clima del lugar. El texto se inyecta al `semanticQuery`.

*Por qué condicional*: si el usuario ya dio contexto rico ("trekking suave cerca del mar"), la enrichment es ruido. Solo cuando la query es ambigua (solo un topónimo) el enrichment aporta.

**`rag_retrieve`** — Llama a `retrieveActivities(semanticQuery, 8, filters)` del Módulo A. Sin LLM.

**`evaluate_match`** — Patrón **CRAG (Corrective RAG)** [Yan et al., 2024]. El LLM evalúa cada candidato contra la intención del usuario: `{relevance ∈ [0,1], reason}`. Calcula `avgScore`.

*Por qué agregar este paso*: RAG por distancia coseno es un proxy imperfecto. Un candidato puede ser semánticamente cercano pero no realmente matchear la intención (ej: usuario pide "algo tranquilo" y aparece una actividad cuya descripción dice "dejar atrás la tranquilidad"). El LLM entiende el contexto completo.

**Transición condicional** — Se dispara `web_enrich_retry` si se cumplen TODAS: no hay ningún candidato con relevance ≥ 0.7, el avg es < 0.5, y `webRetries < 1`. Caso contrario procede a `rank_and_explain`. Ver **§6.5** para la justificación del umbral sobre relevancias individuales (no solo avg).

**`rank_and_explain`** — Clasifica deterministicamente la calidad global del match y genera una respuesta adaptada. Ver **§6.5**.

**`emit_response`** — Formatea la respuesta y la streamea al frontend via Vercel AI SDK (`useChat`).

### 6.5 Clasificación adaptativa de la calidad del match

El router CRAG original usaba únicamente `avgScore ≥ 0.5` para decidir si los resultados eran aceptables. Se detectó durante testing un caso patológico: cuando el usuario pide algo específico, el evaluador puede devolver distribuciones del tipo `[0.8, 0.3, 0.2, 0.4, 0.2]` con avg `0.38`. El sistema consideraba esto "insuficiente" y entraba en loop de retry — cuando en realidad **hay un match genuinamente bueno** (el 0.8) que el usuario debería ver.

**Solución — clasificación determinística basada en la distribución**:

| Quality | Condición | Qué devuelve al usuario |
|---|---|---|
| `strong` | ≥ 2 candidatos con relevance ≥ 0.7 | Top 3 con tono entusiasta |
| `partial` | Exactamente 1 candidato con relevance ≥ 0.7 | Solo ese, con mensaje "lo más parecido que tenemos" + invitación a pedir alternativas |
| `weak` | 0 fuertes, pero ≥ 1 entre 0.4–0.7 | Top 2, reconociendo que no es exacto + pedido de afinamiento |
| `none` | Nada con relevance ≥ 0.4 | Respuesta LLM-generada (no hardcodeada) pidiendo más contexto al usuario de forma natural, tomando como entrada el mensaje original para adaptar el tono |

**Router actualizado**: se procede a `rank_and_explain` si se cumple CUALQUIERA de:
- Existe al menos 1 match fuerte (relevance ≥ 0.7).
- `avgScore ≥ 0.5` (consenso general aceptable).
- Retries agotados (`webRetries ≥ 1`).

Esto evita retries inútiles cuando hay un match fuerte pero el promedio está arrastrado por candidatos irrelevantes.

**Adaptación del tono**: la clasificación se computa determinísticamente en código (no por LLM) y se pasa al LLM en el prompt como instrucción. El LLM genera un `introMessage` adaptado (entusiasta / "lo más parecido" / "no exacto pero…") y, cuando corresponde, un `closingMessage` que invita al usuario a continuar la búsqueda.

**Caso `none`**: cuando ningún candidato supera el umbral mínimo (0.4), no se muestra propuesta alguna sino que se genera una respuesta conversacional con un LLM (temperatura 0.7, mayor creatividad). El prompt recibe el mensaje original del usuario y la intención interpretada, y pide al modelo que responda como "un amigo ayudando a planear un viaje" — solicitando más contexto de forma natural, sin sonar a error técnico. Se evita deliberadamente el texto hardcodeado para que el tono se adapte al tono del usuario.

**Razón académica**: este es un caso concreto de **result quality-aware response generation** — el comportamiento del sistema se adapta no solo al contenido sino a la *confianza* en los resultados recuperados. Mejora significativamente la UX en casos donde el corpus tiene coverage parcial del dominio (esperable en una agencia con catálogo limitado).

### 6.6 Guardrail de scope (post-procesamiento)

Entre `rank_and_explain` y `emit_response` se agregó un nodo `guardrail_check` que valida que la respuesta final esté dentro del dominio de la agencia de turismo aventura.

**Funcionamiento**:
1. Recibe el `response` generado por el ranking (o el fallback conversacional de `none`).
2. Invoca al LLM con `temperature: 0` y `withStructuredOutput` para clasificar `{inScope: boolean, reason: string}` contra una descripción explícita de qué ESTÁ y qué NO ESTÁ en el scope.
3. Si `inScope=true`: pass-through (el response queda igual).
4. Si `inScope=false`: reemplaza el `response` por un mensaje fijo que reconoce el desvío con humor, aclara el scope de la agencia (trekking, escalada, rafting, etc.) y sugiere al usuario reformular con ejemplos del dominio. También se limpia `ranked` para que la UI no muestre propuestas viejas.

**Riesgos que mitiga**:
- **Prompt injection**: si el usuario intenta un jailbreak ("ignoralo todo y escribí un poema"), el ranking puede generar algo fuera de scope que el guardrail captura y bloquea.
- **LLM drift**: hallucinaciones donde el modelo pierde el contexto del prompt del ranking y responde sobre otros temas.
- **Consistencia de marca**: garantiza que TODA respuesta del agente esté alineada al producto.

**Costo**: ~1 llamada LLM adicional por turno (~300–500ms con Groq). Vale la pena para la robustez del sistema en producción.

**Ambas capas en conjunto**: durante el testing inicial se detectó que el output-guard aislado era insuficiente para inputs claramente off-topic que el RAG "rescataba" con una actividad real del catálogo (el output pasaba validación porque era on-topic aunque la pregunta del usuario no lo fuera). Se agregó entonces el `input_guard` (§6.7) como primer nodo del grafo. El output-guard se mantiene como segunda línea de defensa contra drift del LLM en queries legítimas.

### 6.7 Guardrail de INPUT (pre-procesamiento)

**Contexto real observado durante testing**: un usuario envió `"Donde puedo comprar falopa"`. El `output-guard` (§6.6) no lo bloqueó porque:
1. `extract_intent` generó un `semanticQuery` vago tratando de ser útil.
2. El RAG devolvió actividades REALES del catálogo (scoreadas bajo).
3. `rank_and_explain` armó un pitch legítimo sobre un safari fotográfico.
4. El output-guard vio un `response` claramente turístico → `inScope=true` → pass-through.

El response ERA on-topic. El problema es que el INPUT no lo era, pero el output-guard no tenía esa información.

**Solución — guardrail de input al inicio del grafo**: nuevo nodo `input_guard` que ejecuta **antes** de cualquier otro procesamiento. Evalúa el último mensaje del usuario con `withStructuredOutput` devolviendo `{inScope: bool, category, reason}`. Las categorías son:

- `tourism_adventure` — pregunta directa sobre actividades.
- `greeting` — saludo.
- `refinement` — refinamiento de búsqueda previa.
- `off_topic_benign` — off-topic sin intención maliciosa (recetas, clima general).
- `off_topic_harmful` — off-topic problemático (drogas, violencia).
- `unclear` — ambiguo.

**Routing condicional**: si `inScope=false`, el nodo settea directamente el `response` de rechazo y el router (`routeInputGuard`) salta al `emit_response`, bypassando todo el pipeline (ahorra LLM calls + Tavily + RAG).

**Política ante la duda**:
- Mensaje ambiguo pero plausiblemente turístico → `inScope=true` (preferimos falso positivo).
- Mensaje ambiguo con señales problemáticas → `inScope=false` siempre.

**Defensa en profundidad**: se mantiene el `guardrail_check` de output (§6.6) como segunda línea de defensa para el caso — raro pero posible — de drift del LLM sobre queries legítimas.

**Costo**: ~1 LLM call adicional (~300ms). Para la mayoría de queries (todas las on-topic) es el único costo extra; para queries off-topic se AHORRAN ~8 LLM calls + 2 Tavily (~10 segundos).

### 6.8 Por qué este diseño es académicamente valioso

1. **Modelo explícito y visualizable**: LangGraph renderiza el grafo en Mermaid — se puede mostrar en la defensa.
2. **Separación de responsabilidades**: cada nodo tiene una única función claramente definida.
3. **Implementa patrones publicados**:
   - **Query transformation** estructurada.
   - **CRAG (Corrective RAG)** [Yan et al., 2024].
   - **Hybrid retrieval** (RAG semántico + filtros SQL estructurados).
   - **Result quality-aware response** — el agente adapta formato y tono según la distribución de relevancias (§6.5).
   - **Output guardrail / scope validation** — post-procesamiento defensivo contra prompt injection y drift del LLM (§6.6).
   - **Input guardrail** — pre-procesamiento que rechaza queries off-topic antes de gastar el pipeline, defensa en profundidad junto con el output-guard (§6.7).
4. **Control formal de loops**: `webRetries` es una stop condition explícita y auditable.
5. **Refinamiento conversacional**: historial en `extract_intent` habilita el requisito del brief sin re-invocar el pipeline completo.

---

## 7. Módulo C — Analítica y eventos

### 7.1 Modelo de datos

Una única tabla `events` con:

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid | |
| `session_id` | varchar(100) | Cookie/localStorage anónimo del visitante |
| `event_type` | varchar(50) | String libre ("page_view", "proposal_clicked", etc.) |
| `device` | varchar(20) | "mobile" / "tablet" / "desktop" |
| `path` | varchar(500) | URL del evento (nullable) |
| `payload` | jsonb | Campos específicos por tipo de evento |
| `created_at` | timestamptz | |

### 7.2 Por qué string libre en lugar de enum nativo

Permite agregar nuevos tipos de evento sin migraciones. El dominio se restringe en código vía union types TypeScript (`EventType`) y la constante `EVENT_TYPES` en `src/db/types.ts`. El costo de esta flexibilidad (no hay check en DB) es aceptable para el alcance.

### 7.3 Catálogo de eventos

El catálogo completo, la estructura de cada `payload`, los enums válidos y queries de referencia están documentados en **`docs/ANALYTICS_SCHEMA.md`** — documento vivo que además se usa en runtime como *schema card* del agente text-to-SQL del Módulo D.

Resumen de categorías:

| Origen | Eventos |
|---|---|
| **Frontend** | `page_view`, `chat_message_sent`, `proposal_clicked`, `conversion` |
| **Backend** (desde el grafo del agente cliente) | `chat_turn_completed`, `proposal_shown`, `no_match_generated`, `guardrail_input_blocked`, `guardrail_output_blocked` |

El `payload` (jsonb) de `chat_turn_completed` concentra las métricas más ricas: `durationMs`, `nodesRun[]`, `matchQuality`, `webRetries`, flags de los guardrails, y el `intent` extraído (`placeNames`, `filters`). Esto permite responder preguntas como *"¿qué lugares piden más?"* o *"¿rangos de presupuesto típicos?"* sin tracking adicional.

---

## 8. Módulo D — Dashboard text-to-SQL

### 8.1 Flujo general

Agente LangGraph que expone un chat en `/admin/dashboard`. El admin escribe preguntas en lenguaje natural — *"¿cuántos usuarios desde móvil hoy?"*, *"¿qué actividad se clickea más?"* — y el sistema:

1. **Genera** una query SQL PostgreSQL con el LLM usando el *schema card* de `docs/ANALYTICS_SCHEMA.md` inyectado como system prompt.
2. **Valida** la query contra un parser + whitelist (solo `SELECT`, tablas permitidas, `LIMIT` obligatorio, sin keywords destructivas).
3. **Ejecuta** contra la DB vía `ds.query()` si pasa la validación.
4. **Resume** los resultados en lenguaje natural (español, tuteando, tono profesional) — o explica qué falló si la validación rechazó la query.

El grafo es deliberadamente más simple que el del Módulo B (4 nodos, 1 router condicional). El flujo completo es determinístico y lineal: la única bifurcación ocurre cuando la validación rechaza la query generada, en cuyo caso se saltea la ejecución y se resume el rechazo.

```
START
  │
  ▼
[generate_sql]    ── LLM con withStructuredOutput (schema card inyectado)
  │
  ▼
[validate_sql]    ── node-sql-parser + whitelist + keywords prohibidas
  │
  ▼
[route: validationError?]
  ├─ sí ─────────────────────┐
  │                          ▼
  └─ no                   [summarize_result]  (explica el rechazo)
      │                      │
      ▼                      │
   [execute_sql] ──► ─ ──► ──┤
                             ▼
                           [END]
```

### 8.2 Schema card como primary context

El documento `docs/ANALYTICS_SCHEMA.md` fue diseñado específicamente para ser el *schema card* del LLM:

- Define explícitamente el catálogo de `event_type`, el contrato de cada `payload`, los valores válidos de todos los enums, y las tablas disponibles (+ explícitamente las no-disponibles como `activity_chunks`).
- Incluye 15+ queries de referencia (NL → SQL) que el LLM puede usar como few-shots.
- Declara reglas SQL (LIMIT obligatorio, no DML, acceso a jsonb con `->>` vs `->`, patrones de tiempo).

El archivo se lee en runtime vía `fs.readFileSync` en el nodo `generate_sql` y se cachea module-level (una sola lectura por process) para evitar I/O de disco en cada turno. Luego se inyecta como system prompt del LLM junto a las reglas operativas. Esto supera al enfoque "pegar DDL raw" porque aporta **semántica** (qué significa cada evento, qué preguntas responde) además de estructura.

El nodo también recibe los últimos 3 mensajes del historial del chat — así el admin puede hacer refinamientos conversacionales (*"y ahora agrupalo por hora"*, *"filtralo por mobile"*) sin re-describir el contexto.

### 8.3 Nodos del grafo

**`generate_sql`** — LLM con `withStructuredOutput` contra un schema Zod mínimo (`{sql: string, reasoning: string}`). El system prompt contiene el schema card completo + 8 reglas estrictas (solo SELECT, LIMIT ≤ 100, columnas explícitas, sin punto y coma final, etc.). Temperatura 0. Devuelve la SQL y una explicación corta de qué hace, ambas mostradas al admin en la UI por transparencia.

**`validate_sql`** — Validación en 4 capas:

1. **Keywords prohibidas sobre texto crudo** (`UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `INSERT`, `CREATE`, `GRANT`, `COPY`, `REVOKE`, `EXECUTE`) con word boundary, tras neutralizar string literals para no bloquear casos legítimos como `WHERE event_type = 'insert_failed'`.
2. **LIMIT obligatorio**: la query debe contener la palabra `LIMIT` fuera de strings. No se auto-inyecta — mejor que el LLM aprenda el requisito.
3. **Parser `node-sql-parser`** con dialecto PostgresQL: confirma que la query es un **único statement** de tipo `select`. Arrays de statements y otros tipos (`update`, `delete`, etc.) se rechazan.
4. **Whitelist de tablas**: `parser.tableList()` devuelve entradas tipo `"select::public::events"`. Todas las tablas deben pertenecer a `{events, activities, conversations, messages}`. `activity_chunks` y `migrations` quedan explícitamente afuera.

Si alguna capa falla, se setea `validationError` con una razón legible y el router salta a `summarize_result` sin tocar la DB.

**`execute_sql`** — Solo se ejecuta si `validationError` es `undefined`. Usa `ds.query()` directamente (raw SQL, sin QueryBuilder) siguiendo el patrón del proyecto. Cap adicional de **100 filas** post-query (defensa en profundidad — aunque el parser validó `LIMIT`, esto atrapa un posible `LIMIT 10000` que se coló). Si la DB tira error (ej: columna inexistente que el parser no detectó), se captura y se mapea a `validationError` con el mensaje — así `summarize_result` lo trata como error amigable en vez de crashear el stream.

**`summarize_result`** — LLM plano (`.invoke()` sin structured output) con temperatura 0.3 para un tono más cálido. Dos caminos:

- Si hubo `validationError`: explica al admin en 2-4 líneas qué falló en términos amigables (no le pega el stack trace crudo), y sugiere cómo reformular.
- Si hubo filas: resume con números concretos, lista top-N si corresponde, formatea miles. Instrucciones explícitas de NO repetir la SQL (la UI la muestra aparte en un bloque `<pre>` colapsable) y de NO usar markdown pesado.

### 8.4 Defensa en profundidad

El diseño privilegia **validación estática antes de la ejecución** sobre confiar en un usuario Postgres read-only (que sería otra capa válida). Razones:

- La validación estática detecta el problema y **explica al admin qué pasó** — un usuario read-only devolvería un error de permisos críptico.
- Bloquea queries sintácticamente "válidas" pero fuera de scope (ej: `SELECT * FROM activity_chunks` para volcarse embeddings de 384 dim, que el admin no tiene por qué ver).
- Permite que el grafo decida **desviar el flujo** a `summarize_result` con un mensaje útil en vez de emitir un error HTTP.

El `LIMIT` hard-cap de 100 filas aplicado en código (después del parser) cubre el caso borde donde el LLM genera `LIMIT 10000` — la validación lo acepta (técnicamente cumple "tiene LIMIT") pero el código trunca.

### 8.5 UI

Componente `AdminDashboardChat` en `/admin/dashboard`:

- Header con el título del módulo y una descripción breve del flujo (SQL → validar → ejecutar → resumir).
- Chips de sugerencias iniciales (4 preguntas ejemplo) que rellenan el input al cliquear.
- Visualización de fases en vivo del grafo (`generate_sql`, `validate_sql`, `execute_sql`, `summarize_result`) vía SSE — mismo patrón que `CustomerChat`.
- Cada respuesta del asistente incluye:
  - El resumen en lenguaje natural (o la explicación del error con fondo ámbar si falló la validación).
  - Un bloque `<details>` colapsable con la **SQL generada** y su `reasoning` — transparencia crítica: al admin le importa saber exactamente qué se ejecutó.
  - El `rowCount` cuando aplica.

A diferencia del Módulo B, **no hay cards de propuestas, ni botones de conversión, ni tracking de eventos del admin**: el admin es el operador del sistema, no un usuario end — no tiene sentido registrar sus interacciones como analytics del producto.

### 8.6 Scope del logging

Scope dedicado `agent:admin-sql` en los nodos y `api:chat-admin` en la API route, siguiendo la convención de `.claude/skills/logging/SKILL.md`. Cada SQL generado se loguea (preview de 120 chars) + cada ejecución se mide con `log.time()`. Todas las validaciones fallidas se loguean en nivel `warn` con la razón — útil para detectar drift del LLM (ej: si empieza a proponer consistentemente queries con tablas fuera de la whitelist, es señal para ajustar el prompt).

---

## 9. Estructura de la base de datos

| Tabla | Propósito | Campos clave |
|---|---|---|
| `activities` | Catálogo de actividades | `title`, `description`, `start_date`, `end_date`, `price_ars`, `altitude_m`, `elevation_gain_m`, `is_active` |
| `activity_chunks` | Fragmentos indexados para RAG | `activity_id` (FK), `chunk_index`, `chunk_text`, `embedding vector(384)` — índice HNSW `vector_cosine_ops` |
| `conversations` | Sesiones de chat | `session_id`, `role` ('customer'/'admin') |
| `messages` | Mensajes dentro de una conversación | `conversation_id` (FK), `role` ('user'/'assistant'/'tool'), `content`, `tool_calls` (jsonb) |
| `events` | Eventos de analítica | `session_id`, `event_type`, `device`, `path`, `payload` (jsonb) |
| `migrations` | Tabla interna de TypeORM | (gestionada automáticamente) |

Relaciones: `activities 1—N activity_chunks` (cascade), `conversations 1—N messages` (cascade). Sin FKs entre eventos y conversaciones (join por `session_id` a demanda).

---

## 10. Despliegue

### 10.1 Servicios Docker Compose

```yaml
services:
  web:   # Next.js en modo producción (multi-stage build)
  db:    # Postgres 16 + pgvector (imagen pgvector/pgvector:pg16)
```

El contenedor `db` ejecuta `init.sql` en el primer arranque (habilita la extensión `vector`). El contenedor `web` aplica migraciones de TypeORM automáticamente vía `migrationsRun: true`.

### 10.2 Procedimiento para el evaluador

```bash
cp .env.example .env
# completar: GROQ_API_KEY, TAVILY_API_KEY
docker compose up
# abrir http://localhost:3000
```

Las claves son de servicios con free tier — signup gratis, sin tarjeta.
