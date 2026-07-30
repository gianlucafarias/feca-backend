#!/usr/bin/env bash
# Daily Postgres backup to ./backups/ (retention: BACKUP_RETENTION_DAYS).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  echo "Missing .env in ${ROOT_DIR}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "${ROOT_DIR}/.env"
set +a

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_DIR="${ROOT_DIR}/backups"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT_FILE="${BACKUP_DIR}/feca-${STAMP}.sql.gz"
TEMP_FILE="${OUT_FILE}.tmp"

mkdir -p "${BACKUP_DIR}"
trap 'rm -f "${TEMP_FILE}"' EXIT

echo "==> Backing up ${POSTGRES_DB} to ${OUT_FILE}"
docker compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --no-owner \
  --no-acl \
  | gzip -9 > "${TEMP_FILE}"

test -s "${TEMP_FILE}"
gzip -t "${TEMP_FILE}"
mv "${TEMP_FILE}" "${OUT_FILE}"
chmod 600 "${OUT_FILE}"
find "${BACKUP_DIR}" -name 'feca-*.sql.gz' -mtime +"${RETENTION_DAYS}" -delete

echo "Backup complete ($(du -h "${OUT_FILE}" | awk '{print $1}'))"
