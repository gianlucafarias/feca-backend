#!/usr/bin/env bash
# Call internal notification endpoints (receipts + automations).
# Add to crontab every 10 minutes:
#   */10 * * * * /opt/feca/scripts/cron-notifications.sh >> /opt/feca/backups/cron-notifications.log 2>&1
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

set -a
# shellcheck disable=SC1091
source "${ROOT_DIR}/.env"
set +a

if [[ -z "${INTERNAL_NOTIFICATIONS_SECRET:-}" ]]; then
  echo "INTERNAL_NOTIFICATIONS_SECRET is not set" >&2
  exit 1
fi

BASE_URL="https://${APP_DOMAIN}"
AUTH_HEADER="x-feca-internal-secret: ${INTERNAL_NOTIFICATIONS_SECRET}"

curl -fsS -X POST "${BASE_URL}/internal/notifications/receipts" \
  -H "${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  -d '{"limit":300}'

curl -fsS -X POST "${BASE_URL}/internal/notifications/automations" \
  -H "${AUTH_HEADER}"

echo "Notifications cron OK at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
