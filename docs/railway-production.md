# Railway Production

This backend is prepared for a first production deployment on Railway with one app service and one PostgreSQL service.

## Architecture

- `backend`: deploys this repository with the root `Dockerfile`
- `Postgres`: Railway-managed PostgreSQL service
- `DATABASE_URL`: reference variable from the Postgres service into the backend service

## Required Railway variables

Set these in the backend service Variables tab:

```env
NODE_ENV=production
AUTH_JWT_ACCESS_SECRET=<long-random-secret>
AUTH_ACCESS_TOKEN_TTL_MINUTES=15
AUTH_REFRESH_TOKEN_TTL_DAYS=30
GOOGLE_MAPS_API_KEY=<google-maps-server-key>
GOOGLE_OAUTH_WEB_CLIENT_ID=<google-web-client-id>
GOOGLE_PLACES_COUNTRY=uy
GOOGLE_PLACES_LANGUAGE=es
GOOGLE_PLACES_RADIUS_METERS=5000
CACHE_TTL_MS=300000
CACHE_MAX_ITEMS=500
RATE_LIMIT_TTL=60000
RATE_LIMIT_LIMIT=60
TRUST_PROXY=true
CORS_ALLOWED_ORIGINS=<comma-separated-browser-origins>
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Notes:

- `PORT` is injected by Railway automatically.
- If the mobile app is the only client for now, `CORS_ALLOWED_ORIGINS` can be omitted until you add a browser client.
- Use the exact Postgres service name in the reference variable. If Railway names it differently, update `${{Postgres.DATABASE_URL}}` to match that name.

## First deployment from local

1. Install the Railway CLI:

   ```bash
   npm install -g @railway/cli
   ```

2. Log in:

   ```bash
   railway login
   ```

3. Initialize a project from this directory:

   ```bash
   railway init
   ```

4. Add PostgreSQL to the project:

   ```bash
   railway add -d postgres
   ```

5. Deploy the backend:

   ```bash
   railway up
   ```

6. In the Railway dashboard:

- open the backend service Variables tab
- paste the required variables
- generate a public domain in Networking
- redeploy after variables are saved

## Runtime behavior

- Railway uses `railway.toml` for deploy settings.
- The deployment runs `npm run prisma:migrate:deploy` before the app starts.
- Railway waits for `GET /health` to return `200` before switching traffic.

## Later: staging

When you need staging, create a second environment with:

- another backend service or environment-scoped deploy
- another PostgreSQL service
- a separate `DATABASE_URL`
- its own app domain and variables
