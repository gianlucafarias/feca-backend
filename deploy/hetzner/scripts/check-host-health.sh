#!/usr/bin/env bash
# Lightweight host checks used by the external scheduled GitHub monitor.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

DISK_MAX_PERCENT="${DISK_MAX_PERCENT:-85}"
EXPECTED_SERVICES=(backend caddy postgres)

if ! [[ "${DISK_MAX_PERCENT}" =~ ^[0-9]+$ ]] ||
  [[ "${DISK_MAX_PERCENT}" -lt 1 ]] ||
  [[ "${DISK_MAX_PERCENT}" -gt 99 ]]; then
  echo "DISK_MAX_PERCENT must be an integer between 1 and 99" >&2
  exit 1
fi

for service in "${EXPECTED_SERVICES[@]}"; do
  if ! docker compose ps --services --status running | grep -Fxq "${service}"; then
    echo "Docker service is not running: ${service}" >&2
    docker compose ps >&2
    exit 1
  fi
done

DISK_PERCENT="$(
  df -P "${ROOT_DIR}" \
    | awk 'NR == 2 { gsub(/%/, "", $5); print $5 }'
)"
if ! [[ "${DISK_PERCENT}" =~ ^[0-9]+$ ]]; then
  echo "Could not determine disk usage for ${ROOT_DIR}" >&2
  exit 1
fi
if [[ "${DISK_PERCENT}" -ge "${DISK_MAX_PERCENT}" ]]; then
  echo "Disk usage is ${DISK_PERCENT}% (limit: ${DISK_MAX_PERCENT}%)" >&2
  exit 1
fi

"${ROOT_DIR}/scripts/check-backup-health.sh"

echo "Host healthy: services running, disk ${DISK_PERCENT}%"
