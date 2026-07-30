# Hetzner production

Self-hosted production on a Hetzner VPS: Docker Compose stack, GitHub Actions deploys, Caddy TLS, automated backups, and operational runbooks.

## Architecture

```
Internet → Caddy (443) → backend:3001 → Postgres (internal network)
                ↑
         Let's Encrypt
```

| Component | Role |
|-----------|------|
| **Caddy** | HTTPS, security headers, reverse proxy |
| **backend** | NestJS image from GHCR (`FECA_IMAGE`) |
| **postgres** | Postgres 16, volume `postgres_data`, not exposed publicly |
| **GitHub Actions** | CI on every PR; build + deploy on merge to `main` |

Files live in `deploy/hetzner/`.

## One-time server setup

### 1. Create VPS

- **Hetzner Cloud** CX22 or CPX21 (2 vCPU, 4 GB RAM) — enough for beta
- Ubuntu 24.04
- SSH key at creation time
- Point DNS `api.tudominio.com` → server IP

### 2. Bootstrap the server (as root)

Copy `deploy/hetzner/scripts/bootstrap-server.sh` to the server, then:

```bash
export DEPLOY_USER=deploy
export DEPLOY_PATH=/opt/feca
export SSH_PUBLIC_KEY="ssh-ed25519 AAAA... your-key"
sudo bash bootstrap-server.sh
```

This installs Docker, UFW (22/80/443), fail2ban, and creates the `deploy` user.

### 3. Configure secrets on the server

As `deploy`:

```bash
sudo mkdir -p /opt/feca/backups
sudo chown -R deploy:deploy /opt/feca
cd /opt/feca

# Copy from repo (first time only, before CI exists):
# scp -r deploy/hetzner/* deploy@SERVER:/opt/feca/

cp .env.example .env
chmod 600 .env
nano .env   # fill all secrets — never commit .env
```

Required in `.env`: `APP_DOMAIN`, `LETSENCRYPT_EMAIL`, Postgres password, JWT secret, Google keys, `INTERNAL_NOTIFICATIONS_SECRET`.

### 4. GHCR pull access

The server must pull images from GitHub Container Registry.

1. Create a GitHub **fine-grained PAT** with `read:packages` (or classic `read:packages`).
2. On the server as `deploy`:

```bash
echo "YOUR_PAT" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
```

For **public** packages, login may be optional.

### 5. GitHub repository configuration

#### Secrets (Settings → Secrets and variables → Actions)

| Secret | Example |
|--------|---------|
| `HETZNER_HOST` | `123.45.67.89` or `api.tudominio.com` |
| `HETZNER_SSH_USER` | `deploy` |
| `HETZNER_SSH_PRIVATE_KEY` | Private key matching server `authorized_keys` |
| `HETZNER_DEPLOY_PATH` | `/opt/feca` |
| `PRODUCTION_HEALTH_URL` | `https://api.tudominio.com` (for scheduled health workflow) |

#### Environment `production` (optional)

Create environment **production** with required reviewers if you want manual approval before deploy.

#### GHCR package permissions

After first push to `main`, open **Packages → feca-backend → Package settings** and link the repo. For private images, ensure the deploy PAT can pull.

### 6. First manual deploy (before CI or to verify)

```bash
cd /opt/feca
export FECA_IMAGE=ghcr.io/YOUR_ORG/feca-backend:latest
./scripts/deploy.sh "$FECA_IMAGE"
```

### 7. Cron jobs on the server

```bash
cd /opt/feca
./scripts/install-backup-cron.sh   # daily pg_dump at 03:15 UTC

crontab -e
# Add:
*/10 * * * * /opt/feca/scripts/cron-notifications.sh >> /opt/feca/backups/cron-notifications.log 2>&1
```

## Automatic deploy flow

Every merge to `main`:

1. **CI** — `npm run check`, tests, coverage thresholds
2. **Build** — Docker image → `ghcr.io/<repo>:<sha>` and `:latest`
3. **Upload** — `deploy/hetzner` bundle (compose, Caddy, scripts)
4. **Deploy** — SSH runs `scripts/deploy.sh`:
   - `docker compose pull`
   - `prisma migrate deploy`
   - `docker compose up -d`
   - readiness check on `/health/ready`

Rollback:

```bash
cd /opt/feca
./scripts/deploy.sh ghcr.io/YOUR_ORG/feca-backend:PREVIOUS_SHA
```

## Backups

- **Daily** `pg_dump` → `/opt/feca/backups/feca-YYYYMMDD-HHMMSS.sql.gz`
- **Retention** 14 days (`BACKUP_RETENTION_DAYS` in `.env` optional)
- **Restore** (destructive):

```bash
./scripts/restore-postgres.sh backups/feca-20260612-030000.sql.gz
```

**Recommended:** also enable [Hetzner snapshots](https://docs.hetzner.com/cloud/servers/overview/) weekly on the VPS for full-disk recovery.

## Security checklist

| Item | Status |
|------|--------|
| UFW: only 22, 80, 443 | bootstrap script |
| Postgres not on public ports | docker-compose internal network |
| SSH password auth off | bootstrap script |
| fail2ban | bootstrap script |
| TLS via Caddy + HSTS | Caddyfile |
| Secrets in `.env` only (`chmod 600`) | manual |
| Internal routes protected by `INTERNAL_NOTIFICATIONS_SECRET` | app |
| Non-root user in Docker image | Dockerfile |
| `TRUST_PROXY=true` behind Caddy | `.env` |

Rotate `AUTH_JWT_ACCESS_SECRET` and `INTERNAL_NOTIFICATIONS_SECRET` periodically; rotating JWT invalidates all sessions.

## Observability

### Logs (structured JSON)

```bash
cd /opt/feca
docker compose logs -f backend
docker compose logs -f caddy
```

Log rotation is configured in `docker-compose.yml` (max-size / max-file).

### Health endpoints

| URL | Use |
|-----|-----|
| `https://api.../health/live` | Process up |
| `https://api.../health/ready` | Postgres (+ Redis if set) OK |

GitHub Actions **Production health** runs every 10 minutes and checks:

- `/health/ready`;
- the secured notification queue status;
- backend, Caddy, and Postgres container state over SSH;
- host disk usage;
- latest backup age and gzip integrity.

Set `PRODUCTION_INTERNAL_SECRET` to the server's
`INTERNAL_NOTIFICATIONS_SECRET`. Enable workflow-failure notifications for the
operators; a check without a recipient is telemetry, not an alert.

### External integrations to configure

1. **Crash reporting / searchable logs** — choose Sentry or another provider,
   then verify its account, retention, and alert recipient. `SENTRY_DSN` is
   only a placeholder today; the application does not claim it is active.
2. **Off-host backup** — enable a Hetzner snapshot or copy encrypted database
   backups to object storage, then test a restore.
3. **Google Cloud budget/quota alerts** — Places is the main variable cost.
4. **Hetzner graphs** — use the Console for CPU/network trends; the scheduled
   host check already alerts on containers, disk, and backup age.

See [Observability guide](./observability.md).

## Operations cheat sheet

```bash
cd /opt/feca

docker compose ps
docker compose logs -f backend --tail=100
docker compose exec postgres psql -U feca -d feca_backend
cat .current-image

# Manual backup
./scripts/backup-postgres.sh
```

## Troubleshooting

| Problem | Check |
|---------|--------|
| Caddy no certificate | DNS points to server? Ports 80/443 open? `APP_DOMAIN` correct? |
| Backend 503 on ready | `docker compose logs backend`; Postgres healthy? migrations applied? |
| GHCR pull denied | `docker login ghcr.io` on server with read PAT |
| Deploy SSH fails | `HETZNER_SSH_*` secrets; key on `deploy` user |
| Google OAuth fails | OAuth client authorized origins include `https://api.tudominio.com` |

## Related docs

- [Production readiness](./production-readiness.md)
- [Async jobs](./async-jobs.md) — pg-boss on Postgres
- [Database performance](./db-performance.md)
