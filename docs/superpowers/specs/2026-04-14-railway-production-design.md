# Railway Production Design

## Goal

Prepare `feca-backend` for a first production deployment on Railway without GitHub automation, while keeping the repository ready to add `staging` later with minimal changes.

## Decisions

- Deploy the API and PostgreSQL on Railway.
- Keep a single `production` environment for now.
- Use a repository `Dockerfile` for reproducible builds.
- Run Prisma migrations during deployment instead of using `prisma db push`.
- Store all production secrets in Railway Variables.

## Configuration

- Railway injects `PORT`.
- PostgreSQL is exposed to the backend through a reference `DATABASE_URL`.
- `TRUST_PROXY=true` is required in Railway so rate-limiting and request IP handling work behind the platform proxy.
- `CORS_ALLOWED_ORIGINS` is optional and can stay unset until a browser client exists.

## Deployment Flow

1. Create a Railway project from the local directory.
2. Add a PostgreSQL service.
3. Set backend variables and the `DATABASE_URL` reference.
4. Deploy with `railway up`.
5. Verify `/health` and the generated public domain.

## Follow-up

When staging is needed, duplicate the environment shape with a separate database and separate variables instead of sharing production resources.
