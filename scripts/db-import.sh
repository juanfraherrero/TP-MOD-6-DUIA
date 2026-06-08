#!/usr/bin/env bash
#
# Restaura un archivo .dump (formato custom de pg_dump) en la base de datos
# `duia` del contenedor de Postgres. DROPEA y recrea la DB destino antes
# de restaurar, por lo que cualquier dato existente se PIERDE.
#
# Detecta automáticamente si usás docker o podman. Si tenés un nombre de
# contenedor no estándar, exportalo en DB_CONTAINER.
#
# Uso:
#   ./scripts/db-import.sh backups/duia-2026-06-06-101530.dump
#   ./scripts/db-import.sh backups/foo.dump --yes        # skip confirmación
#
set -euo pipefail

DB_SERVICE="${DB_SERVICE:-db}"
DB_USER="${DB_USER:-duia}"
DB_NAME="${DB_NAME:-duia}"

if [ $# -lt 1 ]; then
  echo "Uso: $0 <archivo.dump> [--yes]" >&2
  exit 1
fi

DUMP_FILE="$1"
ASSUME_YES="${2:-}"

if [ ! -f "$DUMP_FILE" ]; then
  echo "ERROR: el archivo '$DUMP_FILE' no existe." >&2
  exit 1
fi

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

if [ -z "${DB_CONTAINER:-}" ]; then
  DB_CONTAINER="$(
    $CLI ps --format '{{.Names}}' \
      | grep -E "[-_]${DB_SERVICE}[-_][0-9]+$" \
      | head -1 || true
  )"
fi

if [ -z "${DB_CONTAINER:-}" ]; then
  echo "ERROR: no encontré el container del servicio '$DB_SERVICE'." >&2
  echo "       Levantalo o pasá DB_CONTAINER=<nombre>." >&2
  $CLI ps --format '  - {{.Names}} ({{.Image}})' >&2 || true
  exit 1
fi

SIZE="$(du -h "$DUMP_FILE" | cut -f1)"
echo "==> CLI: $CLI"
echo "==> Container: $DB_CONTAINER"
echo "==> Vas a RESTAURAR sobre la DB '$DB_NAME'."
echo "    Archivo: $DUMP_FILE ($SIZE)"
echo "    ATENCIÓN: se va a DROPEAR la DB '$DB_NAME' actual y recrearla limpia."

if [ "$ASSUME_YES" != "--yes" ] && [ "$ASSUME_YES" != "-y" ]; then
  read -r -p "¿Continuar? (escribí 'si' para confirmar): " CONFIRM
  if [ "$CONFIRM" != "si" ]; then
    echo "Cancelado."
    exit 0
  fi
fi

echo "==> Cerrando conexiones activas a '$DB_NAME'..."
$CLI exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
  >/dev/null

echo "==> Dropeando y recreando DB '$DB_NAME'..."
$CLI exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"
$CLI exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DB_NAME\";"

echo "==> Habilitando extensión pgvector..."
$CLI exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS vector;"

echo "==> Restaurando dump..."
# --no-owner --no-privileges : ignora ownership/permisos del dump original
#                              (para que funcione aunque el usuario destino
#                              no coincida con el del server origen)
# --exit-on-error            : aborta si hay errores en el restore
$CLI exec -i "$DB_CONTAINER" \
  pg_restore -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-privileges --exit-on-error \
  < "$DUMP_FILE"

echo "==> OK. Restauración completada en DB '$DB_NAME'."
