---
name: llm-provider
description: Use when adding or modifying LLM calls in this TP DUIA project — any agent node, service, or feature that invokes an LLM. Enforces exclusive use of the createLLM() factory from src/agents/shared/llm.ts (which selects provider by env var LLM_PROVIDER=gemini|groq|ollama). Never import ChatGroq, ChatGoogleGenerativeAI, ChatOllama, or any concrete LLM client directly in other files. Also covers rules for withStructuredOutput compatibility (Gemini has stricter schema requirements, Ollama tool calling is less reliable on small local models) and how to add a new provider.
---

# LLM provider pattern — TP DUIA

El proyecto soporta tres providers (Gemini default, Groq cloud alternativo, Ollama local como fallback offline) seleccionables por env. **Toda** la instanciación LLM pasa por un único archivo: `src/agents/shared/llm.ts`.

## La regla

Cualquier código que necesite un LLM:

```ts
import { createLLM } from "@/agents/shared/llm";

const llm = createLLM({ temperature: 0, maxTokens: 1024 });
const result = await llm.invoke([
  ["system", "..."],
  ["user", "..."],
]);
```

Con structured output:

```ts
import { z } from "zod";
const schema = z.object({ foo: z.string() });

const llm = createLLM({ temperature: 0 }).withStructuredOutput(schema, {
  name: "my_node",
});
const parsed = await llm.invoke(prompt);  // ya tipado por el schema
```

**Nunca**:

```ts
import { ChatGroq } from "@langchain/groq";                        // ❌
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";  // ❌
import { ChatOllama } from "@langchain/ollama";                    // ❌
const llm = new ChatGroq({ apiKey: ... });                         // ❌
```

## Por qué importa

**Historia real del proyecto**: Groq baneó la cuenta del dev mid-testing con `organization_restricted`. Como todo el LLM pasaba por `createLLM()`, el swap a Gemini tomó 5 minutos (ver `docs/INFORME_TP.md` §4.5.1). Si cada nodo instanciara su cliente, habrían sido horas.

La abstracción también permite:
- Ajustar temperatura por contexto sin duplicar config del API key.
- Logear qué provider está activo en una sola línea (ver `llm.ts` con el `__llmLogged`).
- Tests futuros que mockeen `createLLM()` en un solo punto.

## Compatibilidad de schemas con Gemini

Gemini's `withStructuredOutput` tiene reglas más estrictas que Groq/OpenAI:

| Regla | OK | Problemático |
|---|---|---|
| Profundidad | ≤3 niveles de nesting | 4+ niveles |
| Recursión | no | sí |
| Enums | `z.enum([...])` | `z.string().refine(...)` |
| Unions | discriminated sobre string literals | unions estructurales complejos |
| Arrays | simples, con `.min()` / `.max()` | nested arrays |
| Optional | con moderación | muchísimos optionals |

Si `withStructuredOutput` falla en Gemini, **simplificá el schema** antes de forzar un swap de provider.

## Ollama — fallback local

Tercer provider (`LLM_PROVIDER=ollama`) orientado a correr un LLM local cuando se agotan los free tiers cloud o simplemente se quiere trabajar offline. Requiere que Ollama esté corriendo (daemon local en `http://localhost:11434`, o el service de compose `ollama` con `--profile ollama`).

**Env vars**:
- `OLLAMA_BASE_URL` (default `http://localhost:11434` local, `http://ollama:11434` en compose con profile).
- `OLLAMA_MODEL` (default `qwen2.5:7b-instruct`).

**Modelo default elegido — `qwen2.5:7b-instruct`**: mejor balance observado entre tool calling, structured output y calidad en español dentro del rango de tamaño (<8GB RAM). Alternativa más chica: `qwen2.5:3b-instruct`.

**Caveat importante — tool calling en local chicos es menos confiable**: los modelos que corren en una laptop (3B–7B params) suelen fallar más seguido con `withStructuredOutput` comparado con Gemini o Groq Llama 70B. Síntomas esperables:
- JSON parseado incompleto o con campos faltantes.
- Alucinaciones en campos enum (responde algo que no está en el `z.enum([...])`).
- Formato de la respuesta drifteando después de varias turns.

Mitigaciones al usar Ollama:
- Usar schemas simples (≤2 niveles nesting, pocos optionals).
- Si un nodo sigue fallando, considerar bajar el uso de `withStructuredOutput` y parsear manual del texto.
- Alternativamente subir a un modelo más grande si la máquina lo banca (13B+, pero sale del requisito de lightweight).

**Cuándo conviene usar Ollama**:
- Free tier de Groq/Gemini agotado y no podés esperar al reset.
- Desarrollo offline (avión, conexión mala).
- Privacidad — los prompts no salen de tu máquina.
- Demo en ambientes sin internet confiable.

**Cuándo NO conviene**:
- Producción real con usuarios concurrentes (un solo GPU/CPU → cola).
- Flujos donde el tool calling es crítico y no tenés tiempo de lidiar con drift.

## Agregar un nuevo provider

1. Instalá el paquete LangChain.js correspondiente (ej: `@langchain/anthropic`).
2. En `createLLM()`, agregá una branch guardada por `provider === "newname"`.
3. Agregá env vars (`<NEW>_API_KEY`, `<NEW>_MODEL`) al `.env.example` y `docker-compose.yml`.
4. Actualizá `.claude/ARCHITECTURE.md` §4.5 y `docs/INFORME_TP.md` §3 (stack table).
5. Updateá `getProvider()` del validador de env.

Todos los nodos existentes siguen funcionando sin cambios — es la razón de la abstracción.

## Qué tocar si cambiás algo del LLM

- Nuevo modelo / provider → `createLLM()` + env vars + docs.
- Nueva temperatura default → `createLLM()`.
- Nuevo tipo de output (streaming tokens, function calling avanzado) → considerar si el cambio se mantiene provider-agnostic o si rompe la abstracción. Si rompe, discutilo con idea-debater antes de implementar.
