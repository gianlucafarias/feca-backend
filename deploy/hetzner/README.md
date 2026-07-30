# Hetzner VPS deploy bundle

Production stack for self-hosted Hetzner. **Do not commit `.env`** (secrets stay on the server).

## Quick links

- Full runbook: [docs/hetzner-production.md](../../docs/hetzner-production.md)
- CI deploy: merge to `main` → GitHub Actions builds GHCR image and SSH deploys

`deploy.sh` persists a new image only after `/health/ready` succeeds. If the
new container fails readiness and a previous image is configured, it rolls the
application back automatically. Database migrations are not rolled back, so
every production migration must remain compatible with the previous image.

## First-time on server

```bash
sudo bash scripts/bootstrap-server.sh   # once, as root
cp .env.example .env && chmod 600 .env  # as deploy user
docker login ghcr.io
./scripts/deploy.sh ghcr.io/ORG/feca-backend:TAG
./scripts/install-backup-cron.sh
```

## Layout

```
docker-compose.yml   # postgres + backend + caddy
Caddyfile            # TLS + reverse proxy
scripts/
  bootstrap-server.sh
  deploy.sh
  backup-postgres.sh
  check-backup-health.sh
  check-host-health.sh
  restore-postgres.sh
  cron-notifications.sh
  install-backup-cron.sh
backups/             # created on server (gitignored)
```

The scheduled production workflow validates readiness, push-delivery health,
all three Docker services, disk usage, and the age/integrity of the latest
database backup. Configure `PRODUCTION_INTERNAL_SECRET` with the same value as
the server's `INTERNAL_NOTIFICATIONS_SECRET`.
