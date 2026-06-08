# Deploy: Vercel + Supabase

Guía para deployar este MVP en Vercel con Postgres + pgvector en Supabase.
Stack: Next.js 15, TypeORM, embeddings via Gemini API (text-embedding-004, 768 dims).

> **Si querés deployar local con Docker**, seguí `docker-compose.yml` y este
> archivo no aplica. Esta guía cubre solo Vercel + Supabase.

---

## 1. Supabase: crear DB con pgvector

1. Crear cuenta en https://supabase.com y un proyecto nuevo.
   - Elegí región cercana a la región de Vercel que vas a usar (por defecto
     Vercel deploya en `iad1` / Washington — elegí Supabase en `us-east-1`).
   - Guardá la **DB password** que generás al crear el proyecto: la vas a usar
     en el connection string.
2. En la UI de Supabase: **Database → Extensions** → buscar `vector` → **Enable**.
   (También se podría hacer por SQL, pero el botón es más rápido.)
3. **Database → Connection string → URI → "Transaction pooler"**. Copialo;
   queda así:
   ```
   postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```
   Es el puerto **6543** (pooler), no 5432. El pooler es lo que necesitás para
   funciones serverless porque maneja la pool de conexiones — si usás el 5432
   directo, Vercel te va a agotar las conexiones de Supabase en minutos.

## 2. Preparar la DB desde tu máquina

Necesitás correr migrations + seed desde tu máquina contra Supabase **antes**
del primer deploy (Vercel correrá las migrations también en cada boot via
`migrationsRun: true`, pero el seed es manual).

1. En tu `.env` local, reemplazá `DATABASE_URL` por la connection string del
   pooler de Supabase.
2. Correr migrations + seed:
   ```bash
   # Migrations: crea tablas y la extensión vector
   npm run migration:run

   # Seed: ingesta actividades y genera embeddings (768 dims via Gemini)
   npm run seed:chubut       # o seed:la-rioja, lo que vayas a demostrar
   ```
   El seed va a llamar a Gemini API por cada chunk, así que tarda un par de
   minutos. Si te corta por rate limit, volvé a correrlo — es idempotente.

3. Verificar que quedó OK:
   ```bash
   psql "$DATABASE_URL" -c "SELECT count(*) FROM activities; SELECT count(*) FROM activity_chunks;"
   ```

## 3. Vercel: deploy

1. Hacé push del repo a GitHub (Vercel lee de ahí).
2. En https://vercel.com/new, **Import** tu repo.
3. **Framework Preset**: Next.js (auto-detect).
4. **Environment Variables** — pegá las del `.env`:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | tu connection string del pooler de Supabase (puerto 6543) |
   | `LLM_PROVIDER` | `gemini` |
   | `GOOGLE_API_KEY` | tu API key de Google AI Studio |
   | `GEMINI_MODEL` | `gemini-2.5-flash-lite` |
   | `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-001` |
   | `TAVILY_API_KEY` | (opcional, solo si usás web search) |
   | `AUTH_SECRET` | cualquier string random largo |
   | `LOG_LEVEL` | `info` |

5. **Deploy**. El primer build tarda 2-3 min.

## 4. Verificar

- Abrí la URL de Vercel (`https://<tu-proyecto>.vercel.app`).
- Probá el chat. La primera request va a ser más lenta (cold start ~5s) porque
  el cliente de TypeORM inicializa la conexión y corre migrations.
- Si el chat falla con 500, revisá los logs en Vercel → Deployments → última
  deployment → Function Logs.

## Limitaciones conocidas en este deploy

- **Subida de imágenes deshabilitada.** El admin no puede subir imágenes
  porque el filesystem de Vercel es read-only. El endpoint `/api/uploads`
  devuelve 501 con un mensaje claro. Usar URLs externas en el campo
  `imageUrl` mientras tanto. Para habilitarlo: portear a Supabase Storage o S3.
- **Migrations corren en cada cold start.** `migrationsRun: true` en
  `data-source.ts`. TypeORM detecta si ya están aplicadas (tabla
  `migrations`), así que es seguro, pero suma latencia al primer request post
  cold-start.
- **Pool de conexiones depende de Supabase.** Por eso el pooler — no cambies a
  la URL directa (puerto 5432) salvo que tengas un plan paid con pool
  suficiente.

## Rotar API keys

Las keys que están en tu `.env` local son las que se compartieron en este
chat. Si pasás algo a producción de verdad (no demo), rotalas:

- Google AI Studio: https://aistudio.google.com/app/apikey
- Groq: https://console.groq.com/keys
- Tavily: https://app.tavily.com/home (settings → API keys)
