# LLM Models Journey — TP DUIA

> Historia completa del debate y decisiones sobre qué modelo LLM usar para el TP, los problemas técnicos encontrados, y la arquitectura defensiva que construimos en el proceso.
>
> Útil para la defensa del TP porque muestra iteración real sobre un problema complejo de producción. También como referencia futura si hay que cambiar de modelo.

---

## 1. Stack final (TL;DR)

- **Provider**: Ollama **remoto**, corriendo en un servidor Proxmox con GPU NVIDIA (CUDA). Ver [`OLLAMA_REMOTE_SETUP.md`](./OLLAMA_REMOTE_SETUP.md) para la infra.
- **Modelo**: `ministral-3:14b` (Mistral AI, 14B params, instruction-tuned, tool calling estable).
- **Swap point**: `src/agents/shared/llm.ts` → `createLLM()` factory con env var `LLM_PROVIDER` (`ollama` | `gemini` | `groq`).
- **Structured output**: `invokeStructured()` helper con doble-path (tool calling primero, JSON-in-markdown como fallback).

El modelo final llegó después de **8 iteraciones**. Cada swap revelaba una limitación técnica que moldeó la arquitectura defensiva del sistema.

---

## 2. Timeline de decisiones

### Fase 1 — Gemini 2.0 Flash (default inicial)

**Decisión**: empezar con Gemini 2.0 Flash por free tier generoso (1500 req/día, 15 RPM) y velocidad.

**Resultado**: funcionó para desarrollo inicial.

**Cambio**: problema de cuotas — la cuenta del dev mostraba **0/0 en Gemini 2.0 Flash** en el panel de rate limits, indicando que el modelo no estaba disponible en ese tier.

### Fase 2 — Groq Llama 3.3 70B

**Decisión**: Groq por inferencia en LPU (rápida) y free tier.

**Resultado**: funcionó brevemente.

**Cambio**: **Groq baneó la cuenta** con `organization_restricted` sin aviso previo mid-testing. Ver `docs/INFORME_TP.md` §4.5.1.

### Fase 3 — Gemma 4 26B (Google)

**Decisión**: como Gemini 2.0 Flash no estaba disponible en la cuenta, el dev cambió a **Gemma 4 26B** (modelo open-weight de Google accesible vía Gemini API). El panel mostraba cuota mucho mayor (15 RPM vs 5, 1.5K RPD vs 20).

**Resultado**: catastrófico.

**Problema crítico**:
```
Error: 400 Bad Request
Function calling is not enabled for models/gemma-3-27b-it
```

**Explicación técnica**: Gemma es una familia de modelos open-weight de Google entrenados para chat general. **No tienen function calling habilitado en la Gemini API**. Sin function calling no hay `withStructuredOutput`. Sin structured output el grafo entero se rompe.

Esto llevó a la decisión de agregar un tercer provider — Ollama local — como fallback robusto.

### Fase 4 — Ollama + qwen2.5:7b-instruct

**Decisión**: Ollama local (corre en el host, sin rate limits ni costos) con Qwen 2.5 7B Instruct — buen balance tamaño/calidad según benchmarks.

**Resultado**: funcional pero intermitente.

**Problema**: el modelo **a veces** emitía tool_calls y **a veces** respondía con texto plano o JSON en markdown:
```
Error: No tool calls found in the response.
```

Los retries automáticos funcionaban en ~50% de los casos. Inaceptable para demo.

**Explicación técnica**: Qwen 2.5 7B Instruct tiene soporte de tool calling en su training pero no es su fuerte. El modelo decide "en runtime" si invocar la tool o responder en texto/JSON. Con prompts del tamaño que usamos (schema card de 14KB, historial conversacional, etc.) la decisión se vuelve errática.

**Qué construimos acá**:
- `invokeWithRetry()` — retry automático ante el error "No tool calls found".
- Logger de raw output cuando todos los retries fallan, para ver qué está emitiendo el modelo.

### Fase 5 — Ollama + qwen2.5-coder:7b

**Decisión**: variante coder del mismo modelo. La hipótesis era que al estar fine-tuneada en código/JSON sería **más consistente** emitiendo structured output.

**Resultado**: paradójicamente peor para tool calling.

**Problema**: el modelo casi nunca emitía tool_calls — siempre respondía con markdown:

```
```sql
SELECT COUNT(DISTINCT session_id) FROM events WHERE created_at::date = CURRENT_DATE
```
REASONING: Cuenta los usuarios únicos del día.
```

O con JSON en markdown:
```
```json
{
  "tool": "evaluate_match",
  "scores": { "id1": 0.9, "id2": 0.0, ... }
}
```
```

**Explicación técnica — por qué coder rompe tool calling**: qwen2.5-coder está fine-tuneada intensivamente sobre datasets de **código** (Python, JavaScript, SQL, JSON manifests). Cuando el modelo recibe un schema JSON como "tool" en el prompt, su bias entrenado interpreta: *"hay un JSON Schema → tengo que escribir código JSON"* en vez de *"hay una tool → tengo que invocarla"*.

Esto es opuesto a lo intuitivo — uno pensaría que un coder model sería mejor para structured output, pero el formato de response correcto es `tool_calls: [...]`, NO `\`\`\`json ... \`\`\``. El coder se inclina al segundo por reflejo.

**Qué construimos acá**:
- **Path 2 del `invokeStructured`** — fallback automático a invoke plano + parse de markdown cuando falla el tool call. Se activa con `"No tool calls found" | "tool_call" | "Failed to parse"` en el error.
- **Parseo de markdown**: regex para extraer `\`\`\`sql`, `\`\`\`json`, etc.
- **Para el SQL del admin**: se cambió a invoke directo + parser de markdown nativo. Abrazamos el bias del coder en lugar de pelearlo.

### Fase 6 — Ollama + qwen3:4b

**Decisión**: upgrade a la generación siguiente (Qwen 3) con el modelo más chico (4B). Según benchmarks ([JD Hodges 2026](https://www.jdhodges.com/blog/local-llms-on-tool-calling-2026-pt1-local-lm/)): **97.5% tool calling pass rate**, más liviano (3.4GB) que las variantes 2.5 (4.7GB).

**Resultado**: tool calling mejoraba pero aparecía un problema nuevo.

**Problema**: **thinking mode por default**. Qwen3 emite razonamiento visible antes de la respuesta:

```
<think>
Let me analyze this... the user is asking about activities in Mar del Plata.
I need to generate SQL that selects from events table...
The schema has payload->>'activityId' which I should cast to uuid...
</think>

```sql
SELECT ...
```

Esto rompía todo por tres razones:

1. **Latencia**: los bloques `<think>` agregaban 10-30 segundos por cada LLM call. Un turno con 5 LLM calls pasaba de 15s a 90s+.
2. **Confusión del parser**: LangChain buscaba tool_calls en la respuesta, pero encontraba `<think>...</think>` primero. El modelo a veces NO llegaba a emitir la tool call porque "gastaba" su output en thinking.
3. **Tokens desperdiciados**: 200-500 tokens en thinking que el usuario nunca ve.

**Explicación técnica — por qué thinking rompe tool calling**: los thinking models (Qwen3, DeepSeek R1, o1) fueron entrenados para un paradigma distinto: razonamiento visible antes de respuesta. Durante la fase de "thinking", el modelo NO está comprometido a un formato de output específico. Cuando termina, se acuerda (o no) de invocar la tool. Con prompts complejos, el modelo puede terminar su thinking y responder en texto plano — se "olvida" del tool.

El directive `/no_think` (oficial de Qwen3) **no siempre se respeta** — especialmente cuando el prompt es largo o hay schema JSON en el contexto.

**Qué construimos acá**:
- `/no_think` agregado al toolHint de `invokeStructured` y a los system prompts del admin-sql — funciona como hint pero no es garantía.
- **Strip de tags `<think>...</think>`** en el parser del fallback — regex que los remueve antes de buscar el JSON.
- Log del raw output para diagnosticar qué está emitiendo el modelo.

### Fase 7 — Ollama + `hoangquan456/qwen3-nothink:8b`

**Decisión**: community build de Qwen3 8B que **strippea el thinking del modelfile**. Resuelve el problema de fase 6 sin sacrificar la calidad de tool calling de Qwen3.

**Resultado**: mejora notable vs fases anteriores, pero **inconsistencia residual**.

**Problema detectado durante stress testing**: en schemas con arrays anidados (particularmente `evaluate_match`, que pide N objetos `{id, relevance, reason}` de una), el modelo emitía tool calls correctos ~75% de las veces. El 25% restante caía al fallback JSON-in-markdown, agregando 20-30s de latencia al turno.

Para un TP donde la demo es en vivo, ese 25% era inaceptable. Tres opciones evaluadas:
1. Subir a qwen3:14b → bancable pero el 8B tampoco era full-fiable.
2. Repartir el schema complejo en N LLM calls → rompe el grafo existente.
3. Cambiar al pipeline a un modelo de 14B reconocido por tool calling fuerte → ver fase 8.

### Fase 8 — Ollama + `ministral-3:14b` en servidor Proxmox con GPU CUDA (FINAL)

**Decisión**: `ministral-3:14b` (Mistral AI, familia Ministral, 14B params). Tool calling alineado con OpenAI function-calling spec, sólido en schemas complejos, buen español.

**Infra**: el 14B no corre cómodamente en CPU. Se montó Ollama en un servidor **Proxmox dedicado con GPU NVIDIA** (CUDA). La app Next.js queda en la laptop apuntando al server vía `OLLAMA_BASE_URL=http://<IP>:11434`. Gracias al desacoplamiento ya construido (`createLLM()` factory), el cambio local → remoto fue solo env vars.

**Ver**: [`OLLAMA_REMOTE_SETUP.md`](./OLLAMA_REMOTE_SETUP.md) para la guía de setup del server.

**Resultado**: **estable**. Tool calling funciona consistentemente en los 5 nodos del grafo cliente + `generate_sql` del admin + `synthesize` del augment. El fallback JSON-in-markdown casi nunca se activa (sigue disponible como red de seguridad).

**Por qué es la combinación correcta**:
- **14B params** → capacity suficiente para schemas complejos (arrays de objetos, discriminated unions).
- **Mistral AI tool calling** → entrenado específicamente para OpenAI function calling spec.
- **GPU CUDA** → latencia sub-3s por LLM call, turnos enteros en <15s.
- **No thinking** → ministral no tiene thinking mode, zero overhead.
- **Español nativo** → Mistral AI es francesa pero multilingüe de serie, rinde muy bien en ES.

**Trade-off aceptado**: requiere GPU. Para demos en máquinas sin GPU queda el fallback CPU con `qwen2.5-coder:7b` (ver `OLLAMA_MODELS.md`) — funcional pero con el mismo 25% de fallback JSON que tenía qwen3-nothink.

---

## 3. Explicaciones técnicas profundas

### 3.1 Qué es tool calling y por qué importa

Tool calling (también "function calling") es un protocolo específico donde el modelo, en lugar de responder texto, emite una estructura `{tool_calls: [{name, arguments}]}`. LangChain's `withStructuredOutput` usa este protocolo para forzar al LLM a devolver respuestas con shape garantizado.

**Sin tool calling**: el modelo puede drift y devolver cualquier formato, y hay que parsear texto con regex frágiles.

**Con tool calling**: el framework bindea el schema como tool → el modelo debe invocarla → el framework parsea `tool_calls[0].arguments` y valida con Zod.

Por eso la pelea con los modelos en este viaje: **sin tool calling robusto, los grafos determinísticos son frágiles**.

### 3.2 Por qué "coder" NO implica "mejor structured output"

Es contraintuitivo. Uno pensaría: coder = JSON, JSON = structured, structured = structured output. Falso.

**Structured output vía tool calling** es un protocolo específico: el modelo debe elegir "invocar la tool" en vez de "escribir código". Coder models, por entrenamiento, prefieren escribir código. Literalmente NO quieren responder vía tool call cuando ven un schema — su instinto es escribir el JSON como output directo.

**Para SQL generation** (admin text-to-SQL) esto es ventaja — abrazamos el bias y parseamos el markdown. Para **validación estructurada** (5 nodos del agente cliente), es bug — queremos el tool call.

### 3.3 Por qué "thinking mode" rompe tool calling

Thinking models (Qwen3 por default, DeepSeek R1, o1) generan una fase de razonamiento visible antes de la respuesta. Durante esa fase:

1. **No hay compromiso con formato**: el modelo está "pensando en voz alta" — texto libre.
2. **Consume el "budget" de output**: si hay límite de tokens, parte se gasta en thinking.
3. **Puede llegar a una conclusión que evade la tool call**: "razoné esto, la respuesta es X" → responde texto plano en vez de invocar la tool.

Thinking es útil para **problemas de razonamiento abierto**. Contraproducente cuando la respuesta debe ser estructurada y determinística, como en un grafo agentic.

---

## 4. Arquitectura defensiva que quedó del viaje

Durante la pelea con los modelos, construimos mecanismos de robustez que quedan utilidad permanente:

| Mecanismo | Dónde | Qué hace |
|---|---|---|
| **`createLLM()` factory** | `src/agents/shared/llm.ts` | Punto único de swap de provider vía env `LLM_PROVIDER` |
| **`invokeStructured()` con doble-path** | mismo archivo | Path 1: tool calling. Path 2 (fallback): invoke + JSON parse |
| **`zod-to-json-schema` en fallback** | mismo archivo | Inyecta el schema JSON exacto al prompt del path 2 |
| **`/no_think` hint en prompts** | todos los nodos | Forward-compat con modelos thinking |
| **Strip de `<think>` tags** | parser del fallback | Safety net para thinking residual |
| **Schemas con `.nullish()` y `.default()`** | customer/nodes.ts | Tolerante a outputs incompletos del modelo |
| **`invokeWithRetry()`** | llm.ts | Retry automático ante fallos transitorios |
| **Debug log de raw output** | llm.ts | Capturamos qué emitió el modelo cuando falla todo |

**Por qué esto es valioso**: aunque hoy andamos con qwen3-nothink:8b, **el día que queramos cambiar de modelo (mejor, más chico, otro provider) el swap es trivial**. Toda la robustez vive en helpers, no en prompts.

---

## 5. Modelos considerados y descartados

| Modelo | Por qué se descartó |
|---|---|
| Gemini 2.0 Flash | No disponible en cuenta free del dev (0/0) |
| Gemini 2.5 Flash | 20 req/día — insuficiente para dev |
| Gemini 2.5 Pro | No disponible en cuenta free |
| Gemma 3 / Gemma 4 | **No soporta function calling** |
| Groq Llama 3.3 70B | Cuenta baneada mid-testing |
| qwen2.5:7b-instruct | Tool calling intermitente (~50% fail rate) |
| qwen2.5-coder:7b | Bias to markdown > tool_calls |
| qwen3:4b | Thinking mode rompe latencia + tool calling |
| qwen3-nothink:8b | Tool calling inconsistente (~25% fallback) en schemas con arrays anidados |
| Nemotron Nano 4B | Tiene thinking por default (NVIDIA reasoning trace) |
| Llama 3.1/3.2 | Tool calling más flojo que Qwen3 (~64% F1) |
| Mistral 7B | Tool calling pobre (distinto a ministral-3:14b — otra familia) |
| Phi-4 Mini | Tool calling 57% en benchmarks |

## 6. Cómo cambiar de modelo en el futuro

Si aparece un modelo mejor o este deja de andar:

1. **Si es otro Ollama model**: `ollama pull <tag>` → cambiar `OLLAMA_MODEL` en `.env` → restart.
2. **Si es otro cloud provider**: agregar una branch en `createLLM()` + env vars → listo.

El resto del sistema — grafos, schemas, prompts, UI — no necesita tocarse. Esa es la ventaja de la abstracción.

**Checklist para evaluar un modelo nuevo:**

- [ ] ¿Corre en Ollama / tiene LangChain.js integration?
- [ ] ¿Soporta tool calling (function calling)?
- [ ] ¿Sin thinking mode, o stripable via modelfile?
- [ ] ¿Maneja schemas con arrays/nesting (nuestros más complejos)?
- [ ] ¿Footprint aceptable (<8GB RAM)?
- [ ] ¿Español decente?

Si todas las respuestas son sí, probar con el flujo completo (no solo un turno aislado).

---

## 7. Referencias

- [I Tested 13 Local LLMs on Tool Calling — JD Hodges 2026](https://www.jdhodges.com/blog/local-llms-on-tool-calling-2026-pt1-local-lm/) — benchmarks de tool calling
- [Ministral 3 — Mistral AI docs](https://mistral.ai/news/ministraux/) — modelo final elegido
- [Qwen3 docs — function calling](https://qwen.readthedocs.io/en/latest/framework/function_call.html)
- [Ollama thinking blog](https://ollama.com/blog/thinking) — thinking models
- `docs/OLLAMA_MODELS.md` — referencia rápida de modelos
- `docs/OLLAMA_REMOTE_SETUP.md` — setup de Ollama en server remoto con GPU (fase 8)
- `docs/INFORME_TP.md` §4.5.1 — historia del swap Groq→Gemini
- `src/agents/shared/llm.ts` — implementación del factory + helpers
