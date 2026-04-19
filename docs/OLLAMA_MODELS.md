# Modelos Ollama — referencia rápida

Cambiá `OLLAMA_MODEL` en `.env` y reiniciá `npm run dev`.

| Modelo | Disco | RAM/VRAM | Tool calling | Español | Uso recomendado |
|---|---|---|---|---|---|
| `ministral-3:14b` ⭐ | 8.4GB | ~14GB VRAM (GPU) | **Excelente** | Muy bueno | **Default actual** — requiere GPU. Tool calling estable en schemas complejos. Ver [`OLLAMA_REMOTE_SETUP.md`](./OLLAMA_REMOTE_SETUP.md). |
| `qwen2.5-coder:7b` | 4.7GB | ~8GB | Muy bueno (código) | Bueno | **Mejor CPU fallback** — tool calling decente; combina bien con la ruta SQL del admin (bias coder útil). |
| `qwen3:8b` | 5GB | ~8GB | Bueno (85% pass) | Bueno | Alternativa CPU con thinking mode — requiere `/no_think` en prompts. |
| `hoangquan456/qwen3-nothink:8b` | 5GB | ~8GB | Bueno pero inconsistente en arrays | Bueno | Fase 7 del journey — reemplazado por ministral por drift en schemas complejos. |
| `qwen2.5:7b-instruct` | 4.7GB | ~8GB | Medio (~50% fail) | Muy bueno | Descartado del TP — ver fase 4. |
| `qwen2.5:14b-instruct` | 9GB | ~16GB (GPU recomendada) | Excelente | Excelente | Alternativa si hay GPU pero no querés ministral. |
| `llama3.1:8b` | 4.7GB | ~8GB | Bueno | Medio | Español más débil que qwen/ministral. |
| `llama3.2:3b` | 2GB | ~4GB | Medio | Medio | Solo para máquinas ultra-livianas. |
| `gemma2:9b` | 5.4GB | ~10GB | Bueno | Bueno | Alternativa si querés probar fuera de la familia qwen. |
| `mistral:7b` | 4.1GB | ~8GB | Pobre | Bueno | Evitar — distinto a ministral-3, structured output flojo. |
| `phi3:mini` | 2.2GB | ~4GB | Medio | Pobre | Evitar para este TP (EN-first). |

## Comandos

```bash
ollama pull <modelo>          # descargar
ollama run <modelo>           # chat interactivo para probar
ollama list                   # ver instalados
ollama rm <modelo>            # liberar espacio
```

## Tips

- **Con GPU (recomendado)**: usá `ministral-3:14b` corriendo en un servidor remoto. Guía completa en [`OLLAMA_REMOTE_SETUP.md`](./OLLAMA_REMOTE_SETUP.md). El setup de CUDA + passthrough es one-time; la app se conecta vía `OLLAMA_BASE_URL=http://<server>:11434`.
- **Sin GPU**: `qwen2.5-coder:7b` es el mejor balance. Tool calling menos consistente que ministral (~25% de las requests caen al fallback JSON-in-markdown), pero el sistema maneja eso automáticamente sin degradación funcional — solo latencia extra.
- **Primera descarga**: cualquier modelo tarda 5-10 min según internet y tamaño.
- **Tool calling en schemas complejos**: los nodos `evaluate_match` y `rank_and_explain` (customer agent) devuelven arrays de objetos. Modelos <14B en CPU fallan más seguido ahí. Ver [`LLM_MODELS_JOURNEY.md`](./LLM_MODELS_JOURNEY.md) §Fase 8 para la decisión completa.
- **Swap de modelo**: cambiás `OLLAMA_MODEL` en `.env` + restart. Toda la abstracción LLM vive en `src/agents/shared/llm.ts` — ningún nodo del grafo ni ningún prompt se toca.
