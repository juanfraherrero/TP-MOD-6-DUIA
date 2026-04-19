# Ollama remoto — guía de infraestructura

Cómo correr Ollama en un servidor dedicado con GPU NVIDIA (CUDA) y apuntar la app Next.js a ese servidor. Es el setup que usamos en este TP para `ministral-3:14b` — el modelo final seleccionado en [LLM_MODELS_JOURNEY.md](./LLM_MODELS_JOURNEY.md).

## Por qué remoto (y no local)

El modelo actual tiene ~14B parámetros y requiere **GPU con ~14GB de VRAM** para latencia aceptable (sub-10s por turno). Correrlo en CPU de laptop lleva los turnos del grafo a minutos y hace la demo inviable.

Si no tenés GPU, existen alternativas CPU-friendly documentadas en [OLLAMA_MODELS.md](./OLLAMA_MODELS.md) — con la concesión de tool calling menos consistente en schemas con arrays anidados (ver §4.5 del informe).

## Arquitectura

```
┌──────────────────────────────────┐          ┌─────────────────────────────────────┐
│  Laptop / docker compose         │          │  Servidor Proxmox                   │
│                                  │          │                                     │
│  ┌────────────────────────┐      │          │  ┌──────────────────────────────┐   │
│  │ Next.js app            │      │          │  │ VM / LXC con GPU passthrough │   │
│  │ (createLLM → Ollama)   │──────┼──────────┼──│ ├─ Drivers NVIDIA + CUDA     │   │
│  │ OLLAMA_BASE_URL=...    │ HTTP │  :11434  │  │ ├─ Ollama (systemd)          │   │
│  └────────────────────────┘      │          │  │ └─ ministral-3:14b (GPU)     │   │
│                                  │          │  └──────────────────────────────┘   │
└──────────────────────────────────┘          └─────────────────────────────────────┘
```

La app no sabe ni le importa dónde vive Ollama — solo resuelve `OLLAMA_BASE_URL`. Gracias al desacoplamiento de `createLLM()` ([ver §4.5 del informe](./INFORME_TP.md)), cambiar local ↔ remoto es una env var.

## Setup del servidor — overview + links

Sigue las guías oficiales de cada pieza. Orden recomendado:

### 1. Servidor Proxmox con GPU passthrough

Configurar una VM o contenedor LXC con acceso a la GPU NVIDIA del host.

- [Proxmox VE Wiki — PCI(e) Passthrough](https://pve.proxmox.com/wiki/PCI_Passthrough) — setup completo de passthrough en VMs.
- [Proxmox — GPU passthrough con NVIDIA (comunidad)](https://pve.proxmox.com/wiki/NVIDIA_vGPU) — opciones específicas para tarjetas consumer.

**Checkpoint**: `lspci | grep -i nvidia` dentro de la VM debe listar la GPU.

### 2. Drivers NVIDIA + CUDA toolkit

Dentro de la VM/LXC, instalar los drivers propietarios de NVIDIA y el CUDA toolkit.

- [NVIDIA — CUDA Installation Guide for Linux](https://docs.nvidia.com/cuda/cuda-installation-guide-linux/) — guía oficial por distro.
- Para Ubuntu/Debian: `apt install nvidia-driver-XXX nvidia-cuda-toolkit` (reemplazar XXX por la versión que matchea la GPU).

**Checkpoint**: `nvidia-smi` debe mostrar la GPU con uso de memoria al 0% y los drivers cargados.

### 3. Instalar Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

- [Ollama download page](https://ollama.com/download) — incluye variantes para otras distros y arquitecturas.
- [Ollama GPU support docs](https://github.com/ollama/ollama/blob/main/docs/gpu.md) — troubleshooting de detección de GPU.

El installer detecta automáticamente si hay GPU NVIDIA con drivers y activa el backend CUDA.

**Checkpoint**: `ollama --version` responde; `systemctl status ollama` muestra el daemon activo.

### 4. Exponer la API en la LAN

Por default Ollama escucha solo en `127.0.0.1`. Para que la app desde otra máquina pueda conectarse:

Editar `/etc/systemd/system/ollama.service` y agregar:
```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
```

Después:
```bash
systemctl daemon-reload
systemctl restart ollama
```

**Asegurate** de que el firewall del server permita el puerto 11434 desde tu red. Si usás `ufw`:
```bash
ufw allow from 192.168.1.0/24 to any port 11434
```

**Checkpoint**: desde la laptop, `curl http://<IP-del-servidor>:11434/api/tags` responde JSON (vacío o con modelos).

### 5. Pullear el modelo

```bash
ollama pull ministral-3:14b
```

Pesa ~8.4GB en disco. Primera descarga tarda varios minutos.

**Checkpoint**: `ollama list` lo muestra; `ollama ps` cuando tenga una request en curso debería indicar `GPU` en la columna `PROCESSOR`.

## Conectar la app al servidor remoto

En el `.env` de la app:

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://<IP-del-servidor>:11434
OLLAMA_MODEL=ministral-3:14b
```

Restart `npm run dev` (o `docker compose restart web`). En el log de arranque debería aparecer:

```
INFO  agent:llm      LLM provider activo: ollama (ministral-3:14b)
```

## Verificación rápida end-to-end

Desde la laptop:

```bash
# 1. Listar modelos del server
curl http://<IP>:11434/api/tags

# 2. Ping de inferencia (debe responder en <5s con GPU)
curl http://<IP>:11434/api/generate \
  -d '{"model":"ministral-3:14b","prompt":"hola","stream":false}'

# 3. Abrir la app y mandar un turno — confirmar en la terminal del server:
ollama ps   # muestra el modelo en uso + GPU + VRAM asignada
```

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `connection refused` desde la app | `OLLAMA_HOST` sigue en `127.0.0.1`, o firewall | Editar el systemd override + permitir puerto 11434 en firewall |
| Turnos muy lentos (>60s) | Ollama no detectó GPU, cayó a CPU | `nvidia-smi` en el server (debe mostrar proceso de Ollama). Reinstalar Ollama post-drivers si hace falta |
| `model not found` | Modelo no pulleado en el server remoto | `ollama pull ministral-3:14b` en el server |
| App arranca pero no invoca el LLM | `OLLAMA_BASE_URL` apunta a `localhost` todavía | Confirmar el `.env` tiene la IP del server remoto |

## Para máquinas sin GPU

Si no tenés acceso a un servidor con GPU, el camino alternativo es Ollama **local** con un modelo más chico (≤8B). Ver [OLLAMA_MODELS.md](./OLLAMA_MODELS.md) para la tabla de trade-offs y [Quickstart del README](../README.md#quickstart-docker-compose) para el setup con `docker compose --profile ollama up`.

El flujo funcional queda igual — la única diferencia es que el tool calling va a caer al fallback JSON-in-markdown con más frecuencia, sumando latencia. No afecta la corrección del resultado.
