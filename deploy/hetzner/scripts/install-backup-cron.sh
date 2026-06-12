#!/usr/bin/env bash
# Install daily backup cron (03:15 UTC).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRON_LINE="15 3 * * * cd ${ROOT_DIR} && ./scripts/backup-postgres.sh >> ${ROOT_DIR}/backups/backup.log 2>&1"

(crontab -l 2>/dev/null | grep -v 'backup-postgres.sh'; echo "${CRON_LINE}") | crontab -
echo "Installed cron: ${CRON_LINE}"
