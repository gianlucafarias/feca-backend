# Contributing

FECA is currently maintained as a focused product repository. Bug reports and
small, scoped pull requests are welcome. Discuss substantial product,
architecture, schema, or deployment changes before implementing them.

## Development workflow

1. Use Node.js 22 or newer.
2. Install the lockfile exactly with `npm ci`.
3. Copy `.env.example` to `.env` and use development credentials.
4. Start PostgreSQL with `npm run db:up`.
5. Apply migrations with `npm run prisma:migrate:deploy`.
6. Keep secrets and personal or production data out of commits and fixtures.
7. Add or update tests for behavior changes.
8. Run `npm run release:check` before opening a pull request.

Schema migrations must be backward-compatible with the previous application
image because deployment rollback does not reverse database migrations.

Pull requests should explain the user impact, implementation boundary,
verification performed, migration impact, and operational considerations.
