# Analytics Schema Reference

> **Audiencia doble**:
> 1. **Humano** — referencia al trabajar sobre el Módulo C o D.
> 2. **Text-to-SQL agent (Módulo D)** — este documento se inyecta en el system prompt como **schema card**. La calidad de las queries generadas depende de que esté al día.
>
> **Regla de oro**: al agregar un nuevo event_type o cambiar un payload, actualizar este documento en el mismo commit.

---

## 1. Tabla `events`

Única tabla relacional donde se capturan todos los eventos de analytics del sistema.

```sql
CREATE TABLE events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   varchar(100) NOT NULL,   -- UUID anónimo (cookie/localStorage)
  event_type   varchar(50)  NOT NULL,   -- ver §3 catálogo
  device       varchar(20)  NOT NULL,   -- 'mobile' | 'tablet' | 'desktop'
  path         varchar(500),             -- URL del evento (nullable)
  payload      jsonb NOT NULL DEFAULT '{}',  -- campos específicos, ver §3
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX events_created_at_idx ON events (created_at DESC);
CREATE INDEX events_session_id_idx ON events (session_id);
CREATE INDEX events_event_type_idx ON events (event_type);
```

Sin FKs hacia otras tablas — los joins con `activities` / `conversations` se hacen a demanda (ver §5).

---

## 2. Enums y vocabulario

### 2.1 `device` (columna)
- `mobile` — teléfono.
- `tablet` — tablet.
- `desktop` — laptop / escritorio.

Detectado server-side del `User-Agent` del request.

### 2.2 `event_type` (columna — lista completa)

| Event type | Fuente | Descripción breve |
|---|---|---|
| `page_view` | frontend | Navegación a una página |
| `chat_message_sent` | frontend | Usuario envió mensaje al chat |
| `proposal_clicked` | frontend | Click en una propuesta del ranking |
| `conversion` | frontend | Click en "Me interesa" de una actividad |
| `chat_turn_completed` | backend | Agente terminó de procesar un turno |
| `proposal_shown` | backend | Una actividad se mostró en el ranking (1 evento por actividad) |
| `no_match_generated` | backend | El agente cayó en `matchQuality = "none"` |
| `guardrail_input_blocked` | backend | Input rechazado por `input_guard` (Módulo B §6.7) |
| `guardrail_output_blocked` | backend | Response reemplazado por `guardrail_check` (Módulo B §6.6) |

### 2.3 `payload.matchQuality` (solo en eventos de chat)
- `strong` — ≥ 2 candidatos con relevance ≥ 0.7.
- `partial` — exactamente 1 candidato con relevance ≥ 0.7.
- `weak` — ningún fuerte, pero ≥ 1 entre 0.4 y 0.7.
- `none` — nada superó 0.4.

Ver Informe §6.5 para la definición completa.

### 2.4 `payload.category` (solo en `guardrail_input_blocked`)
- `tourism_adventure` — (no debería aparecer acá; sería inScope=true).
- `greeting` — (ídem).
- `refinement` — (ídem).
- `off_topic_benign` — off-topic sin intención maliciosa (recetas, clima general).
- `off_topic_harmful` — off-topic problemático (drogas, violencia, etc.).
- `unclear` — ambiguo, clasificado como off-scope por precaución.

---

## 3. Catálogo de eventos — estructura del `payload`

### 3.1 `page_view` (frontend)
```json
{
  "referrer": "https://..." | null
}
```
Las columnas `path` y `device` llevan la info principal.

### 3.2 `chat_message_sent` (frontend)
```json
{
  "messageIndex": 0,         // 0-based, número de mensaje del usuario en la sesión
  "length": 47                // chars del mensaje
}
```

### 3.3 `proposal_clicked` (frontend)
```json
{
  "activityId": "uuid",
  "rank": 1                   // 1, 2 o 3
}
```

### 3.4 `conversion` (frontend)
```json
{
  "activityId": "uuid"
}
```

### 3.5 `chat_turn_completed` (backend)
Emitido al final de cada turno del chat. Es **el evento más rico** — concentra métricas de performance + decisiones del agente.

```json
{
  "durationMs": 5432,
  "nodesRun": ["input_guard", "extract_intent", "rag_retrieve", "evaluate_match", "rank_and_explain", "guardrail_check", "emit_response"],
  "matchQuality": "partial",     // enum §2.3
  "webRetries": 0,                // 0 o 1 (CRAG retry disparado?)
  "hadWebEnrichment": false,      // ¿usó Tavily proactivo (isOnlyPlace)?
  "blockedByInputGuard": false,
  "blockedByOutputGuard": false,
  "intent": {
    "placeNames": ["Bariloche"],
    "filters": {
      "maxPriceArs": 60000,
      "targetDate": null,            // ISO "YYYY-MM-DD" cuando el usuario menciona un día puntual
      "dateRangeStart": null,        // ISO — extremo inferior de un rango mencionado
      "dateRangeEnd": null           // ISO — extremo superior
    }
  }
}
```

### 3.6 `proposal_shown` (backend)
Se emite **un evento por cada actividad** del ranking final (hasta 3 por turno).

```json
{
  "activityId": "uuid",
  "rank": 1,                      // 1, 2 o 3
  "relevance": 0.85,              // score del evaluador
  "matchQuality": "strong"        // enum §2.3 — calidad GLOBAL del turno
}
```

### 3.7 `no_match_generated` (backend)
```json
{
  "userMessage": "texto truncado a 200 chars",
  "placeNames": ["X", "Y"]
}
```
Útil para detectar qué búsquedas no atiende el catálogo actual.

### 3.8 `guardrail_input_blocked` (backend)
```json
{
  "category": "off_topic_harmful",  // enum §2.4
  "reason": "el mensaje pregunta por drogas",
  "userMessage": "texto truncado a 200 chars"
}
```

### 3.9 `guardrail_output_blocked` (backend)
```json
{
  "reason": "la respuesta derivó hacia...",
  "matchQualityAtBlock": "weak"
}
```

---

## 4. Tablas relacionadas (para JOINs)

### `activities`
```sql
activities (
  id uuid,
  title varchar(200),
  description text,
  price_ars decimal(12,2),
  start_date timestamptz,       -- ver nota más abajo sobre semántica
  end_date timestamptz,
  altitude_m int,
  elevation_gain_m int,
  is_active boolean,
  recurrence jsonb,             -- null = one-time | {kind:"weekly",days,startTime,endTime} | {kind:"dates",dates,startTime,endTime}
  available_dates date[],       -- fechas materializadas (GIN). Ver Informe §4.13.
  ...
)
```

**IMPORTANTE — semántica de `start_date` / `end_date` según `recurrence`**:

| `recurrence` | Significado de `start_date` / `end_date` |
|---|---|
| `null` (one-time) | Inicio y fin reales de la actividad. `end_date - start_date` = duración real. |
| `{kind: "weekly", ...}` | Ventana de validez (temporada). **NO representa la duración de cada ocurrencia** — cada ocurrencia dura `endTime - startTime` en horas. |
| `{kind: "dates", ...}` | `min(dates)` y `max(dates)` aproximados — no es la duración. |

**Para queries sobre "duración" / "cuántos días" de una actividad**:
- Si el admin pregunta "actividades de más de N días" casi siempre se refiere a **one-time multi-day** (ej: un trek de 4 días). Filtrar `recurrence IS NULL` + `(end_date::date - start_date::date) > N`.
- Si pregunta sobre duración **por ocurrencia** en recurrentes: `recurrence->>'endTime'::time - recurrence->>'startTime'::time`.

**Nombres de columnas**: usar EXACTAMENTE estos — NO existen `start_time`, `end_time`, `finish_time`, `duration`, `schedule`.

Join vía `events.payload->>'activityId' = activities.id::text` cuando el event_type es uno de: `proposal_shown`, `proposal_clicked`, `conversion`.

**Queries de ejemplo sobre recurrencia y duración**:

```sql
-- Actividades disponibles el sábado 22 de noviembre de 2026.
SELECT id, title FROM activities
WHERE is_active = true AND '2026-11-22'::date = ANY(available_dates)
LIMIT 50;

-- Actividades que corren los fines de semana (sábado o domingo).
SELECT id, title, recurrence->'days' AS days
FROM activities
WHERE recurrence->>'kind' = 'weekly'
  AND (recurrence->'days' ? 'sat' OR recurrence->'days' ? 'sun')
LIMIT 50;

-- Actividades one-time que duren más de 3 días (ej: treks largos).
SELECT id, title,
       (end_date::date - start_date::date) AS duration_days,
       start_date, end_date
FROM activities
WHERE is_active = true
  AND recurrence IS NULL
  AND (end_date::date - start_date::date) > 3
ORDER BY duration_days DESC
LIMIT 50;
```

### `conversations`
```sql
conversations (
  id uuid,
  session_id varchar(100),
  role varchar(20),    -- 'customer' | 'admin'
  created_at timestamptz
)
```
Join vía `events.session_id = conversations.session_id`.

### `messages`
```sql
messages (
  id uuid,
  conversation_id uuid,
  role varchar(20),     -- 'user' | 'assistant' | 'tool'
  content text,
  created_at timestamptz
)
```

**Tablas NO disponibles para text-to-SQL**: `activity_chunks`, `migrations`.

---

## 5. Reglas SQL para el text-to-SQL agent

Cuando generes SQL a partir de una pregunta del admin:

### 5.1 Operación
- **Solo `SELECT`**. Nunca `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `COPY`, `GRANT`.
- **Siempre `LIMIT`** — al menos 100 para listados, 1 para agregados únicos.

### 5.2 Tablas permitidas
`events`, `activities`, `conversations`, `messages`. **Prohibido**: `activity_chunks`, `migrations`.

### 5.3 Acceso a JSONB
- `payload->>'key'` — devuelve text.
- `payload->'key'` — devuelve jsonb (para subobjetos).
- `(payload->>'number')::int` / `::numeric` — cast cuando se necesita aritmética.
- `jsonb_array_elements_text(payload->'placeNames')` — expandir arrays de strings.

### 5.4 Patrones de tiempo
- Hoy: `created_at::date = CURRENT_DATE`.
- Últimos N días: `created_at >= now() - interval 'N days'`.
- Rango: `created_at BETWEEN '2026-01-01' AND '2026-01-31'`.
- Por hora: `date_trunc('hour', created_at)`.

### 5.5 Usuarios únicos
Usar `COUNT(DISTINCT session_id)` en lugar de `COUNT(*)`. El `session_id` es la mejor aproximación de "usuario único" (no hay auth).

### 5.6 Performance
- Siempre filtrar por `event_type` si la pregunta lo implica (hay índice).
- Filtrar por `created_at` si hay recency implícita (hay índice DESC).

---

## 6. Queries de ejemplo (NL → SQL)

### 6.1 Volumen y usuarios

**"¿Cuántos usuarios únicos hubo hoy?"**
```sql
SELECT COUNT(DISTINCT session_id) AS unique_users
FROM events
WHERE created_at::date = CURRENT_DATE;
```

**"¿Cuántos clientes consultaron desde móviles hoy?"**
```sql
SELECT COUNT(DISTINCT session_id) AS mobile_users
FROM events
WHERE device = 'mobile'
  AND event_type = 'chat_message_sent'
  AND created_at::date = CURRENT_DATE;
```

**"Tráfico por hora del último día"**
```sql
SELECT date_trunc('hour', created_at) AS hour,
       COUNT(DISTINCT session_id) AS users,
       COUNT(*) AS events
FROM events
WHERE created_at >= now() - interval '1 day'
GROUP BY hour
ORDER BY hour;
```

### 6.2 Engagement del chat

**"Promedio de mensajes por conversación"**
```sql
SELECT AVG(cnt) AS avg_messages
FROM (
  SELECT session_id, COUNT(*) AS cnt
  FROM events
  WHERE event_type = 'chat_message_sent'
  GROUP BY session_id
) t;
```

**"Duración promedio de un turno del agente"**
```sql
SELECT AVG((payload->>'durationMs')::numeric) AS avg_ms
FROM events
WHERE event_type = 'chat_turn_completed';
```

**"¿Qué % de turnos activan el retry CRAG?"**
```sql
SELECT
  100.0 * COUNT(*) FILTER (WHERE (payload->>'webRetries')::int > 0)
  / NULLIF(COUNT(*), 0) AS pct_with_retry
FROM events
WHERE event_type = 'chat_turn_completed';
```

### 6.3 Actividades

**"¿Cuál es la actividad más mostrada?"**
```sql
SELECT a.id, a.title, COUNT(*) AS shown
FROM events e
JOIN activities a ON a.id = (e.payload->>'activityId')::uuid
WHERE e.event_type = 'proposal_shown'
GROUP BY a.id, a.title
ORDER BY shown DESC
LIMIT 5;
```

**"¿Cuál es la actividad más clickeada?"**
```sql
SELECT a.id, a.title, COUNT(*) AS clicks
FROM events e
JOIN activities a ON a.id = (e.payload->>'activityId')::uuid
WHERE e.event_type = 'proposal_clicked'
GROUP BY a.id, a.title
ORDER BY clicks DESC
LIMIT 5;
```

**"¿Cuál es la actividad con mejor CTR (click/shown)?"**
```sql
SELECT
  a.id, a.title,
  COUNT(*) FILTER (WHERE e.event_type = 'proposal_shown') AS shown,
  COUNT(*) FILTER (WHERE e.event_type = 'proposal_clicked') AS clicked,
  100.0 * COUNT(*) FILTER (WHERE e.event_type = 'proposal_clicked')
    / NULLIF(COUNT(*) FILTER (WHERE e.event_type = 'proposal_shown'), 0) AS ctr_pct
FROM events e
JOIN activities a ON a.id = (e.payload->>'activityId')::uuid
WHERE e.event_type IN ('proposal_shown', 'proposal_clicked')
GROUP BY a.id, a.title
HAVING COUNT(*) FILTER (WHERE e.event_type = 'proposal_shown') > 5
ORDER BY ctr_pct DESC
LIMIT 10;
```

**"¿Cuál es la actividad más rechazada?"** (shown pero nunca clickeada, o con peor CTR)
```sql
-- Misma query que CTR pero ORDER BY ctr_pct ASC
```

**"Actividades que nunca se mostraron"**
```sql
SELECT a.id, a.title
FROM activities a
LEFT JOIN events e
  ON e.event_type = 'proposal_shown'
  AND (e.payload->>'activityId')::uuid = a.id
WHERE e.id IS NULL AND a.is_active = true;
```

### 6.4 Calidad de match y cobertura del catálogo

**"¿Qué % de consultas no encuentran match?"**
```sql
SELECT
  100.0 * COUNT(*) FILTER (WHERE payload->>'matchQuality' = 'none')
  / NULLIF(COUNT(*), 0) AS pct_no_match
FROM events
WHERE event_type = 'chat_turn_completed';
```

**"Distribución de match quality"**
```sql
SELECT payload->>'matchQuality' AS quality, COUNT(*) AS n
FROM events
WHERE event_type = 'chat_turn_completed'
GROUP BY quality
ORDER BY n DESC;
```

**"¿Qué lugares piden más los usuarios?"**
```sql
SELECT place, COUNT(*) AS mentions
FROM events,
     jsonb_array_elements_text(payload->'intent'->'placeNames') AS place
WHERE event_type = 'chat_turn_completed'
GROUP BY place
ORDER BY mentions DESC
LIMIT 20;
```

**"Rangos de presupuesto más solicitados"**
```sql
SELECT
  CASE
    WHEN (payload->'intent'->'filters'->>'maxPriceArs')::numeric < 30000 THEN '< 30k'
    WHEN (payload->'intent'->'filters'->>'maxPriceArs')::numeric < 60000 THEN '30-60k'
    WHEN (payload->'intent'->'filters'->>'maxPriceArs')::numeric < 100000 THEN '60-100k'
    ELSE '100k+'
  END AS bucket,
  COUNT(*) AS n
FROM events
WHERE event_type = 'chat_turn_completed'
  AND payload->'intent'->'filters'->>'maxPriceArs' IS NOT NULL
GROUP BY bucket
ORDER BY bucket;
```

### 6.5 Guardrails y safety

**"¿Cuántos intentos off-topic hubo esta semana?"**
```sql
SELECT COUNT(*) AS blocked
FROM events
WHERE event_type = 'guardrail_input_blocked'
  AND created_at >= now() - interval '7 days';
```

**"Categorías de off-topic más frecuentes"**
```sql
SELECT payload->>'category' AS category, COUNT(*) AS n
FROM events
WHERE event_type = 'guardrail_input_blocked'
GROUP BY category
ORDER BY n DESC;
```

### 6.6 Conversión

**"Tasa de conversión global"**
```sql
WITH
  visits AS (SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE event_type = 'page_view'),
  converted AS (SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE event_type = 'conversion')
SELECT
  visits.n AS total_visitors,
  converted.n AS converters,
  100.0 * converted.n / NULLIF(visits.n, 0) AS conversion_rate_pct
FROM visits, converted;
```

**"Conversiones por dispositivo"**
```sql
SELECT device, COUNT(*) AS conversions
FROM events
WHERE event_type = 'conversion'
GROUP BY device
ORDER BY conversions DESC;
```

**"Funnel completo"**
```sql
SELECT
  COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'page_view')          AS visited,
  COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'chat_message_sent')  AS chatted,
  COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'proposal_clicked')   AS clicked,
  COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'conversion')         AS converted
FROM events
WHERE created_at >= now() - interval '7 days';
```

---

## 7. Don'ts para el text-to-SQL agent

- ❌ Nunca queryear `activity_chunks` (vectores grandes, no interesan al admin).
- ❌ Nunca `SELECT *` — listar columnas explícitas.
- ❌ Nunca devolver embeddings como output.
- ❌ No operaciones destructivas (DELETE/UPDATE/DROP/etc).
- ❌ No subconsultas correlacionadas sin LIMIT — pueden ser O(N²).
- ❌ No asumir campos que no están en este documento — si la pregunta no se puede responder con estas tablas y eventos, informalo al admin en lugar de inventar SQL.

---

## 8. Cómo este documento se usa en runtime

Cuando se implemente el Módulo D (`src/agents/admin-sql/`):

1. Al arrancar, el nodo de generación de SQL lee este archivo vía `fs.readFileSync`.
2. Se inyecta como parte del system prompt del LLM junto a las reglas operativas.
3. El LLM genera SQL ajustado al schema real, no alucina nombres de columnas.

Mantener este archivo en sync con los eventos reales emitidos es responsabilidad de cualquier PR que toque el catálogo.
