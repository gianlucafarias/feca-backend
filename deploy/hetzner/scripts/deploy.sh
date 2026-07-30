#!/usr/bin/env bash
# Pull a new image, run migrations, restart stack, verify readiness.
# Usage: ./scripts/deploy.sh ghcr.io/org/feca-backend:abc123
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

IMAGE="${1:?Usage: deploy.sh <full-image-tag>}"
ENV_FILE="${ROOT_DIR}/.env"
PREVIOUS_IMAGE="$(
  sed -n 's/^FECA_IMAGE=//p' "${ENV_FILE}" 2>/dev/null | tail -n 1
)"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Copy .env.example and configure secrets." >&2
  exit 1
fi

echo "==> Deploying ${IMAGE}"
export FECA_IMAGE="${IMAGE}"

echo "==> Pulling image"
docker compose pull backend

echo "==> Running migrations"
docker compose run --rm --no-deps backend npm run prisma:migrate:deploy

echo "==> Starting services"
docker compose up -d --remove-orphans

echo "==> Waiting for backend readiness"
for _ in $(seq 1 30); do
  if docker compose exec -T backend node -e \
    "fetch('http://127.0.0.1:3001/health/ready').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "Backend is ready."
    break
  fi
  sleep 2
done

if ! docker compose exec -T backend node -e \
  "fetch('http://127.0.0.1:3001/health/ready').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
  echo "Backend failed readiness check." >&2
  docker compose logs --tail=80 backend >&2

  if [[ -n "${PREVIOUS_IMAGE}" && "${PREVIOUS_IMAGE}" != "${IMAGE}" ]]; then
    echo "==> Rolling back application to ${PREVIOUS_IMAGE}" >&2
    export FECA_IMAGE="${PREVIOUS_IMAGE}"
    docker compose up -d --no-deps backend

    for _ in $(seq 1 30); do
      if docker compose exec -T backend node -e \
        "fetch('http://127.0.0.1:3001/health/ready').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
        echo "Rollback is ready." >&2
        break
      fi
      sleep 2
    done
  else
    echo "No previous image is configured; automatic rollback is unavailable." >&2
  fi

  exit 1
fi

if grep -q '^FECA_IMAGE=' "${ENV_FILE}"; then
  sed -i.bak "s|^FECA_IMAGE=.*|FECA_IMAGE=${IMAGE}|" "${ENV_FILE}"
  rm -f "${ENV_FILE}.bak"
else
  printf '\nFECA_IMAGE=%s\n' "${IMAGE}" >> "${ENV_FILE}"
fi
chmod 600 "${ENV_FILE}"
printf '%s\n' "${IMAGE}" > "${ROOT_DIR}/.current-image"

echo "==> Pruning old images"
docker image prune -af --filter "until=72h" || true

docker compose ps
echo "Deploy finished: ${IMAGE}"
