#!/usr/bin/env bash
# Pull a new image, run migrations, restart stack, verify readiness.
# Usage: ./scripts/deploy.sh ghcr.io/org/feca-backend:abc123
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

IMAGE="${1:?Usage: deploy.sh <full-image-tag>}"
ENV_FILE="${ROOT_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Copy .env.example and configure secrets." >&2
  exit 1
fi

echo "==> Deploying ${IMAGE}"
export FECA_IMAGE="${IMAGE}"

if grep -q '^FECA_IMAGE=' "${ENV_FILE}"; then
  sed -i.bak "s|^FECA_IMAGE=.*|FECA_IMAGE=${IMAGE}|" "${ENV_FILE}"
else
  echo "FECA_IMAGE=${IMAGE}" >> "${ENV_FILE}"
fi

echo "${IMAGE}" > "${ROOT_DIR}/.current-image"

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
  exit 1
fi

echo "==> Pruning old images"
docker image prune -af --filter "until=72h" || true

docker compose ps
echo "Deploy finished: ${IMAGE}"
