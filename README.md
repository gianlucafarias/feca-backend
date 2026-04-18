# FECA Backend

NestJS backend for FECA's mobile app, including places, visits, saves, feed, following/followers, groups, and diaries.

## Stack

- NestJS
- Express adapter
- Prisma
- PostgreSQL
- Nest cache / rate limit
- class-validator / class-transformer
- Zod for environment validation

## Docs

- [Mobile API spec](./docs/mobile-api-spec.md)
- [Social graph](./docs/social-graph.md)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy env vars:

   ```bash
   Copy-Item .env.example .env
   ```

3. Start PostgreSQL:

   ```bash
   npm run db:up
   ```

4. Apply Prisma migrations:

   ```bash
   npm run prisma:migrate:deploy
   ```

5. Start in dev mode:

   ```bash
   npm run start:dev
   ```

## Google auth env

To test mobile Google sign-in, set these variables in `.env`:

- `AUTH_JWT_ACCESS_SECRET`
- `AUTH_ACCESS_TOKEN_TTL_MINUTES`
- `AUTH_REFRESH_TOKEN_TTL_DAYS`
- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_OAUTH_WEB_CLIENT_ID`

## Railway production

This backend is prepared to run on Railway with:

- Railway-managed PostgreSQL
- deployment-time Prisma migrations
- Dockerfile-based builds
- `/health` as the healthcheck path

See [Railway production guide](./docs/railway-production.md).
