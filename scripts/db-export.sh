#!/usr/bin/env bash
#
# Exporta la base de datos `duia` del contenedor de Postgres a un archivo
# `.dump` en formato custom de Postgres (comprimido, restaurable con
# pg_restore). Salida en backups/duia-YYYY-MM-DD-HHMMSS.dump
#
# Detecta automáticamente si usás docker o podman. Si tenés un nombre de
# contenedor no estándar, exportalo en DB_CONTAINER.
#
# Uso:
#   ./scripts/db-export.sh                       # nombre con timestamp automático
#   ./scripts/db-export.sh mi-backup             # -> backups/mi-backup.dump
#   DB_CONTAINER=otro ./scripts/db-export.sh     # forzar nombre de container
#
set -euo pipefail

DB_SERVICE="${DB_SERVICE:-db}"
DB_USER="${DB_USER:-duia}"
DB_NAME="${DB_NAME:-duia}"
BACKUP_DIR="${BACKUP_DIR:-backups}"

# --- detectar CLI (docker o podman) -----------------------------------------
detect_cli() {
  if command -v docker >/dev/null 2>&1 && docker ps >/dev/null 2>&1; then
    echo docker; return 0
  fi
  if command -v podman >/dev/null 2>&1 && podman ps >/dev/null 2>&1; then
    echo podman; return 0
  fi
  return 1
}

if ! CLI="$(detect_cli)"; then
  echo "ERROR: no se pudo conectar al daemon de docker ni de podman." >&2
  exit 1
fi

# --- encontrar el container de la DB ----------------------------------------
# Si el usuario seteó DB_CONTAINER, lo respetamos. Si no, buscamos el primer
# container cuyo nombre matchee el patrón de compose: *-<DB_SERVICE>-<n> o
# *_<DB_SERVICE>_<n>.
if [ -z "${DB_CONTAINER:-}" ]; then
  DB_CONTAINER="$(
    $CLI ps --format '{{.Names}}' \
      | grep -E "[-_]${DB_SERVICE}[-_][0-9]+$" \
      | head -1 || true
  )"
fi

if [ -z "${DB_CONTAINER:-}" ]; then
  echo "ERROR: no encontré el container del servicio '$DB_SERVICE'." >&2
  echo "       Levantalo (docker compose up -d $DB_SERVICE) o pasá DB_CONTAINER=<nombre>." >&2
  echo "       Containers visibles:" >&2
  $CLI ps --format '  - {{.Names}} ({{.Image}})' >&2 || true
  exit 1
fi

mkdir -p "$BACKUP_DIR"

if [ $# -ge 1 ]; then
  OUT_FILE="$BACKUP_DIR/${1%.dump}.dump"
else
  TS="$(date +%Y-%m-%d-%H%M%S)"
  OUT_FILE="$BACKUP_DIR/${DB_NAME}-${TS}.dump"
fi

echo "==> CLI: $CLI"
echo "==> Container: $DB_CONTAINER"
echo "==> Exportando DB '$DB_NAME' -> $OUT_FILE"

# -F c : formato custom (binario, comprimido, restaurable con pg_restore)
# -Z 9 : máxima compresión
$CLI exec -i "$DB_CONTAINER" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -F c -Z 9 \
  > "$OUT_FILE"

SIZE="$(du -h "$OUT_FILE" | cut -f1)"
echo "==> OK. Backup generado: $OUT_FILE ($SIZE)"
echo
echo "Para restaurarlo en otra máquina:"
echo "  1) Copiar $OUT_FILE"
echo "  2) Levantar el contenedor de la DB"
echo "  3) ./scripts/db-import.sh $OUT_FILE"
