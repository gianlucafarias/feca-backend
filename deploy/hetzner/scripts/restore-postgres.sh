#!/usr/bin/env bash
# Restore Postgres from a gzip dump created by backup-postgres.sh.
# Usage: ./scripts/restore-postgres.sh backups/feca-20260612-120000.sql.gz
# WARNING: overwrites the current database.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

DUMP_FILE="${1:?Usage: restore-postgres.sh <path-to.sql.gz>}"

if [[ ! -f "${DUMP_FILE}" ]]; then
  echo "File not found: ${DUMP_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "${ROOT_DIR}/.env"
set +a

read -r -p "This will REPLACE database ${POSTGRES_DB}. Type 'restore' to continue: " CONFIRM
if [[ "${CONFIRM}" != "restore" ]]; then
  echo "Aborted."
  exit 1
fi

echo "==> Stopping backend"
docker compose stop backend

echo "==> Restoring from ${DUMP_FILE}"
gunzip -c "${DUMP_FILE}" | docker compose exec -T postgres psql \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --set ON_ERROR_STOP=1

echo "==> Starting backend"
docker compose up -d backend

echo "Restore complete."
