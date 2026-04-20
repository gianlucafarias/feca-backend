# Oracle Cloud Deployment

This backend can run inside OCI Always Free using a single Ampere A1 VM with local PostgreSQL, Docker Compose, and Caddy for HTTPS.

## Target architecture

- `VM.Standard.A1.Flex` in your home region
- Ubuntu image marked `Always Free Eligible`
- `backend`: this repository built from the root `Dockerfile`
- `postgres`: local container with a persistent Docker volume
- `caddy`: public reverse proxy with automatic Let's Encrypt certificates

This setup keeps the project inside Always Free as long as you stay within the OCI free limits for compute, block storage, and egress.

## OCI resources to create

Create one compute instance with:

- shape: `VM.Standard.A1.Flex`
- size: `2 OCPU / 12 GB RAM` to start
- boot volume: `50 GB`
- image: Ubuntu `Always Free Eligible`
- public IPv4 enabled

Networking rules:

- SSH `22/tcp`: only from your IP
- HTTP `80/tcp`: `0.0.0.0/0`
- HTTPS `443/tcp`: `0.0.0.0/0`

If you already know this API will have higher traffic, you can allocate the full Always Free limit of `4 OCPU / 24 GB RAM`.

## DNS

Point your API domain to the instance public IP before starting Caddy:

- type: `A`
- host: for example `api.tudominio.com`
- value: your OCI public IP

Wait for DNS propagation before the first `docker compose up`, otherwise Let's Encrypt cannot issue the certificate.

## Server bootstrap

SSH into the VM and install Docker tooling:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
newgrp docker
```

If your Ubuntu image does not provide `docker-compose-v2`, install the Docker Compose plugin package available for that image and continue with `docker compose`.

## Project setup on the VM

Clone the repository and prepare the OCI deployment env file:

```bash
git clone <tu-repo> ~/feca-backend
cd ~/feca-backend/deploy/oci
cp .env.example .env
```

Edit `deploy/oci/.env` and replace every placeholder value.

Minimum required values:

```env
APP_DOMAIN=api.tudominio.com
LETSENCRYPT_EMAIL=ops@tudominio.com
POSTGRES_PASSWORD=<password-largo-y-random>
AUTH_JWT_ACCESS_SECRET=<secret-largo-y-random>
GOOGLE_MAPS_API_KEY=<google-maps-server-key>
GOOGLE_OAUTH_WEB_CLIENT_ID=<google-web-client-id>
TRUST_PROXY=true
```

Notes:

- `DATABASE_URL` is assembled automatically by Compose from the PostgreSQL variables.
- Leave `CORS_ALLOWED_ORIGINS` empty if the mobile app is the only client for now.
- Set `CORS_ALLOWED_ORIGINS` to a comma-separated list if you later add web clients.

## First deploy

From `deploy/oci`:

```bash
docker compose up -d --build
docker compose logs -f backend
```

What happens during startup:

- PostgreSQL initializes its data volume
- the backend waits for PostgreSQL health
- Prisma runs `migrate deploy`
- Caddy provisions HTTPS and proxies traffic to the backend

## Verification

Check local container health:

```bash
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 caddy
```

Check the public endpoint:

```bash
curl https://api.tudominio.com/health
```

Expected response:

```json
{
  "ok": true,
  "service": "feca-backend"
}
```

## Subsequent deploys

When you push changes:

```bash
cd ~/feca-backend
git pull
cd deploy/oci
docker compose up -d --build
```

## Backups

At minimum, export PostgreSQL periodically:

```bash
cd ~/feca-backend/deploy/oci
docker compose exec postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "backup-$(date +%F).sql"
```

For safer operations, copy backups out of the instance regularly or upload them to object storage.

## Troubleshooting

### Certificate issuance fails

- confirm the domain points to the VM public IP
- confirm ports `80` and `443` are open in OCI
- confirm no other process is already using those ports

### Backend restarts repeatedly

- inspect `docker compose logs backend`
- verify `GOOGLE_MAPS_API_KEY`, `GOOGLE_OAUTH_WEB_CLIENT_ID`, and `AUTH_JWT_ACCESS_SECRET`
- verify Prisma migrations can reach PostgreSQL

### Database connection errors

- inspect `docker compose logs postgres`
- verify `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` in `.env`
- if you changed the volume layout, ensure the old data directory is compatible

## Included files

- `deploy/oci/docker-compose.yml`
- `deploy/oci/Caddyfile`
- `deploy/oci/.env.example`

## Official references

- [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/)
- [Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Ampere A1 Compute](https://docs.oracle.com/en-us/iaas/Content/Compute/References/arm.htm)
- [Load Balancer Concepts](https://docs.oracle.com/en-us/iaas/Content/Balance/Concepts/balanceoverview_topic-Load_Balancing_Concepts.htm)
- [Creating a Load Balancer](https://docs.oracle.com/en-us/iaas/Content/Balance/Tasks/managingloadbalancer_topic-Creating_Load_Balancers.htm)
