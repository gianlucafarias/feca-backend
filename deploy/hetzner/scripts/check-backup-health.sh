#!/usr/bin/env bash
# Fail when the latest database backup is missing, corrupt, empty, or too old.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${ROOT_DIR}/backups"
MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-30}"

if ! [[ "${MAX_AGE_HOURS}" =~ ^[0-9]+$ ]] || [[ "${MAX_AGE_HOURS}" -lt 1 ]]; then
  echo "BACKUP_MAX_AGE_HOURS must be a positive integer" >&2
  exit 1
fi

LATEST_BACKUP="$(
  find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'feca-*.sql.gz' \
    -print 2>/dev/null \
    | sort \
    | tail -n 1
)"

if [[ -z "${LATEST_BACKUP}" ]]; then
  echo "No Postgres backup found in ${BACKUP_DIR}" >&2
  exit 1
fi

test -s "${LATEST_BACKUP}"
gzip -t "${LATEST_BACKUP}"

NOW_EPOCH="$(date +%s)"
if stat --version >/dev/null 2>&1; then
  BACKUP_EPOCH="$(stat -c %Y "${LATEST_BACKUP}")"
else
  BACKUP_EPOCH="$(stat -f %m "${LATEST_BACKUP}")"
fi
AGE_SECONDS=$((NOW_EPOCH - BACKUP_EPOCH))
MAX_AGE_SECONDS=$((MAX_AGE_HOURS * 60 * 60))

if [[ "${AGE_SECONDS}" -gt "${MAX_AGE_SECONDS}" ]]; then
  echo "Latest backup is older than ${MAX_AGE_HOURS} hours: ${LATEST_BACKUP}" >&2
  exit 1
fi

echo "Backup healthy: ${LATEST_BACKUP} ($((AGE_SECONDS / 3600))h old)"
