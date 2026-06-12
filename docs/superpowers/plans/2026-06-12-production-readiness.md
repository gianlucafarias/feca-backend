# Plan de preparación para producción — feca-backend

> **Para agentes:** Usar `superpowers:executing-plans` o `subagent-driven-development` fase por fase. Cada fase produce software desplegable y verificable por sí sola.

**Goal:** Dejar el backend listo para producción real — escalable horizontalmente, observable, rápido y con costo predecible — sin acoplarse aún a un proveedor de deploy.

**Architecture:** Mantener el monolito NestJS; endurecer la base (tests, CI, observabilidad), abstraer estado efímero (cache/rate-limit) detrás de interfaces, partir god classes por bounded context, y mover trabajo pesado/async fuera del request path. Infra externa mínima: Postgres + Redis (cuando haya 2+ instancias) + cola opcional en fase 3.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL, Vitest, GitHub Actions, OpenTelemetry (SDK) + export compatible con cualquier backend (Grafana Cloud free, Axiom, Datadog, Railway logs), Redis vía `@nestjs/cache-manager` + `cache-manager-redis-yet` o Upstash REST.

**Principios de costo**

| Recurso | MVP (1 instancia) | Escala (2+ instancias) |
|---------|-------------------|------------------------|
| App | 0.25–0.5 vCPU, 512 MB | 1 vCPU, 1 GB |
| Postgres | 512 MB, sin réplica | 1 GB + connection pooler |
| Redis | **Opcional** — seguir in-memory | Upstash / Redis ~$0–10/mes |
| Observabilidad | Logs estructurados + health | OTel + métricas + alertas |
| Google Places | Mayor costo variable — cache agresivo | Igual + single-flight distribuido |

---

## Mapa de fases

```
Fase 0 ──► Fundamentos (tests + CI)           [1–2 semanas]  ← empezar acá
Fase 1 ──► Observabilidad                     [3–5 días]
Fase 2 ──► Cache & rate limit portables       [1 semana]
Fase 3 ──► Refactor incremental god classes   [2–3 semanas, paralelo]
Fase 4 ──► Performance DB & geo               [1–2 semanas]
Fase 5 ──► Jobs async (push, imports)         [1 semana]
Fase 6 ──► Checklist deploy-agnostic          [2–3 días]
```

**Orden recomendado:** 0 → 1 → 2 → (3 en paralelo con 4 cuando haga falta) → 5 → 6.

---

## Fase 0 — Fundamentos (tests + CI)

**Por qué primero:** Sin red de seguridad, cada refactor de las fases 3–5 es arriesgado. Costo $0.

### 0.1 Setup Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts `test`, `test:watch`, `test:coverage`)
- Modify: `tsconfig.build.json` — excluir `**/*.spec.ts`

```bash
npm install -D vitest @vitest/coverage-v8
```

Scripts en `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

### 0.2 Tests de lógica pura en `lib/` (alto ROI)

Prioridad — archivos pequeños, sin DB, lógica crítica de producto:

| Archivo | Qué testear |
|---------|-------------|
| `src/lib/nearby-ranking.ts` | Orden, ties, edge cases |
| `src/lib/taste-place-score.ts` | Scores con distintos inputs |
| `src/lib/explore-intent-score.ts` | Intent matching |
| `src/lib/score-feca-place-quality.ts` | Quality score bounds |
| `src/lib/geo.ts` | `distanceInMeters`, edge cases |
| `src/lib/normalize-visit-place-tag.ts` | Normalización |
| `src/lib/place-curation.ts` | Badge/expiry logic |

Crear: `src/lib/__tests__/nearby-ranking.spec.ts` (y análogos).

### 0.3 Tests de integración mínimos (Prisma)

- Create: `test/helpers/prisma-test-env.ts` — DB de test (Docker o `DATABASE_URL` separada)
- Create: `test/integration/auth.service.spec.ts` — login Google mock + refresh rotation
- Create: `test/integration/health.spec.ts` — `GET /health` con `@nestjs/testing`

Usar `@nestjs/testing` + `supertest` para 3–5 flujos críticos:

1. `GET /health` → 200
2. Refresh token rotation
3. `POST /visits` (auth mock)
4. Rate limit devuelve 429 tras N requests

### 0.4 CI en GitHub Actions

- Create: `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: feca_test
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run check
      - run: npm run test
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/feca_test
          # ... env mínimo para tests (ver .env.test.example)
```

- Create: `.env.test.example` con variables dummy válidas para Zod

**Criterio de done:** `npm run test` pasa local y en CI; coverage ≥ 60% en `src/lib/`.

---

## Fase 1 — Observabilidad

**Por qué:** Sin visibilidad no sabés si es lento, caro o roto. Funciona igual en Railway, Fly, Render o Containers.

### 1.1 Logging estructurado

**Files:**
- Create: `src/common/logging/structured-logger.ts`
- Modify: `src/main.ts` — logger JSON en `production`
- Modify: `src/common/filters/all-exceptions.filter.ts` — log con `requestId`, `path`, `statusCode`, stack solo en no-prod

Formato objetivo (una línea JSON):

```json
{"level":"error","time":"...","requestId":"...","service":"feca-backend","msg":"...","path":"/places/nearby","durationMs":142}
```

### 1.2 Request ID + timing middleware

**Files:**
- Create: `src/common/middleware/request-context.middleware.ts`
- Modify: `src/app.module.ts` o `main.ts` — registrar middleware

Cada request recibe `X-Request-Id` (generado o propagado). Guardar en `AsyncLocalStorage` para logs correlacionados.

### 1.3 Healthcheck profundo (readiness vs liveness)

**Files:**
- Modify: `src/health/health.controller.ts`
- Modify: `src/health/health.module.ts` — inyectar `PrismaService`

Endpoints:

| Ruta | Uso | Checks |
|------|-----|--------|
| `GET /health/live` | Liveness | proceso OK |
| `GET /health/ready` | Readiness (Railway/K8s) | Postgres `SELECT 1`, Redis si configurado |

Mantener `GET /health` como alias de `live` para no romper `railway.toml`.

### 1.4 Métricas HTTP básicas

**Files:**
- Create: `src/common/metrics/http-metrics.interceptor.ts`
- Modify: `src/app.module.ts` — interceptor global

Contadores in-process (suficiente para 1 instancia):

- `http_requests_total{method, route, status}`
- `http_request_duration_ms` (histograma simple: p50/p95 en log cada N requests)

En fase posterior: export OTel → cualquier backend.

### 1.5 Errores externos (opcional, bajo costo)

- Integrar **Sentry** (`@sentry/nestjs`) detrás de env `SENTRY_DSN` (opcional).
- Free tier generoso; solo activar en staging/prod.

**Criterio de done:** cada request tiene `requestId` en logs; `/health/ready` falla si Postgres cae; errores 5xx loguean contexto suficiente para debug.

---

## Fase 2 — Cache y rate limit portables

**Por qué:** Blocker #1 para escalar horizontalmente. Diseño deployment-agnostic.

### 2.1 Abstracción de cache

**Files:**
- Create: `src/infrastructure/cache/cache.module.ts`
- Create: `src/infrastructure/cache/cache-store.factory.ts`
- Modify: `src/app.module.ts` — reemplazar `CacheModule.registerAsync` directo

Lógica:

```typescript
// Si REDIS_URL está definido → Redis
// Si no → in-memory (dev / 1 instancia MVP)
```

Env nuevo en `src/config/env.validation.ts`:

```typescript
REDIS_URL: optionalStringSchema,
```

### 2.2 Single-flight distribuido

**Files:**
- Create: `src/infrastructure/cache/distributed-single-flight.service.ts`
- Modify: `src/places/places.service.ts` — reemplazar `Map` local

Implementación:

- Con Redis: `SET key NX EX 30` + polling o pub/sub simple
- Sin Redis: fallback al `Map` actual

### 2.3 Rate limit coherente (cuando hay Redis)

**Files:**
- Modify: `src/app.module.ts` — `ThrottlerModule` con storage Redis si disponible
- Documentar: sin Redis, throttle sigue siendo per-instance (aceptable para 1 réplica)

Alternativa costo $0 en 1 instancia: mantener in-memory; activar Redis storage solo al escalar.

### 2.4 Admin override persistente

**Files:**
- Modify: `src/config/app-config.service.ts` — mover `fecaAdminOverrideUserIds` a tabla `user_admin_overrides` o flag en `User`
- Create: migración Prisma

Elimina estado en memoria que se pierde al reiniciar.

**Criterio de done:** con `REDIS_URL` seteado, dos instancias comparten cache de Places; sin Redis, comportamiento idéntico al actual.

---

## Fase 3 — Refactor incremental (god classes)

**Por qué:** Mantenibilidad y velocidad de equipo. Hacer incrementalmente, no big-bang.

### 3.1 Partir `SocialRepository` (2746 líneas)

Target — un archivo por agregado, misma interfaz pública temporal:

| Nuevo archivo | Responsabilidad |
|---------------|-----------------|
| `social-feed.repository.ts` | Feed queries, paginación |
| `social-graph.repository.ts` | Follow/unfollow, blocks |
| `social-groups.repository.ts` | Groups, members, events |
| `social-diaries.repository.ts` | Diaries, places |
| `social-visits.repository.ts` | createVisit, visit queries |
| `social-settings.repository.ts` | User settings |

**Files:**
- Create: archivos anteriores bajo `src/infrastructure/repositories/social/`
- Modify: `src/infrastructure/infrastructure.module.ts` — exportar todos
- Modify: `src/infrastructure/repositories/social.repository.ts` — facade fino que delega (deprecar gradualmente)

### 3.2 Partir `SocialService` (1538 líneas)

Misma estrategia facade:

- `FeedService`
- `GroupsService`
- `DiariesService`
- `FollowService`
- `TasteService`

Controllers apuntan a servicios específicos; `SocialService` queda como re-export temporal.

### 3.3 Partir `PlacesService` (1664 líneas)

- `PlacesAutocompleteService`
- `PlacesNearbyService`
- `PlacesExploreService`
- `PlacesCityService`
- `PlacesDetailService`

Extraer primero métodos que solo usan cache + Google (más fáciles de testear con mocks).

### 3.4 Partir `api-presenters.ts` (773 líneas)

- `src/lib/presenters/places.presenter.ts`
- `src/lib/presenters/social.presenter.ts`
- `src/lib/presenters/visits.presenter.ts`
- `src/lib/api-presenters.ts` — re-exports

### 3.5 Eliminar deuda obvia

- Borrar o usar `VisitsRepository` — un solo path para crear visits
- Mover `AuthRepository` y `GoogleDataPortabilityRepository` a `infrastructure/repositories/` (consistencia)
- Reemplazar `ensureUserSettingsForAllUsers()` por migración one-shot + constraint; remover de hot paths

**Criterio de done:** ningún archivo nuevo > 400 líneas; `social.repository.ts` facade < 200 líneas.

---

## Fase 4 — Performance DB y geo

**Por qué:** Nearby/explore son hot paths; Google Places es el mayor costo variable.

### 4.1 Connection pooling

**Files:**
- Modify: `src/database/prisma.service.ts`
- Documentar en README

Para serverless/edge futuro: Prisma Accelerate o PgBouncer. Para VPS/Railway/Fly:

```env
# DATABASE_URL → pooler (PgBouncer / Neon pooler / Supabase pooler)
# DIRECT_URL → conexión directa para migraciones (Prisma)
```

Agregar `directUrl` en `prisma/schema.prisma` si usan pooler externo.

### 4.2 Índices y queries

Auditar con `EXPLAIN ANALYZE` en:

- Feed queries (visits por follower, orden por fecha)
- Nearby places por `cityId` + filtros
- Notifications unread count

**Files:**
- Create: migraciones con `@@index` donde falten

### 4.3 Geo en Postgres (cuando el dataset crezca)

Opciones por costo:

| Opción | Costo | Cuándo |
|--------|-------|--------|
| Bounding box SQL (lat/lng range) | $0 | >500 lugares/ciudad |
| PostGIS | $0 (extensión PG) | Queries geo complejas |
| Precomputed grid cells | $0 | Nearby muy frecuente |

**Files:**
- Modify: `src/infrastructure/repositories/places.repository.ts` — reemplazar fetch 250 + JS filter por query con bounding box
- Create: `src/lib/geo-bounds.ts` + tests

### 4.4 Reducir costo Google Places

Ya hay cache; reforzar:

- TTL diferenciado por endpoint (autocomplete corto, detail largo)
- Log métrica `google_places_requests_total` por tipo
- Alerta si > X requests/hora (observabilidad fase 1)

**Criterio de done:** nearby no trae 250 rows para filtrar en JS en ciudades con >100 lugares; p95 latencia nearby < 300ms en staging.

---

## Fase 5 — Jobs async

**Por qué:** Push e imports Google no deberían bloquear requests.

### 5.1 Abstracción de cola

**Files:**
- Create: `src/infrastructure/queue/queue.module.ts`
- Create: `src/infrastructure/queue/queue.service.ts`

Backends (elige uno por env):

| Backend | Costo | Deploy |
|---------|-------|--------|
| **In-process** (MVP) | $0 | 1 instancia |
| **BullMQ + Redis** | ~$5/mes | 2+ instancias |
| **pg-boss** (Postgres) | $0 extra | Sin Redis |

Recomendación costo-conscious: **pg-boss** — usa Postgres que ya tenés.

### 5.2 Mover push dispatch

**Files:**
- Modify: `src/social/push-dispatch.service.ts` — enqueue en lugar de enviar inline
- Create: `src/social/push-dispatch.worker.ts`

### 5.3 Mover Google Data Import

**Files:**
- Modify: `src/google-data-portability/google-data-portability-import.service.ts` — job async
- ZIP parsing fuera del request HTTP

**Criterio de done:** import Google retorna 202 + job id; push no añade >50ms al request que lo dispara.

---

## Fase 6 — Checklist deploy-agnostic

Documento operativo — funciona en Railway, Fly, Render, Cloudflare Containers, VPS.

**Files:**
- Create: `docs/production-readiness.md`

### 6.1 Variables de entorno (mínimo prod)

```env
NODE_ENV=production
DATABASE_URL=...
AUTH_JWT_ACCESS_SECRET=...
GOOGLE_MAPS_API_KEY=...
GOOGLE_OAUTH_WEB_CLIENT_ID=...
TRUST_PROXY=true
INTERNAL_NOTIFICATIONS_SECRET=...
# Opcionales al escalar:
REDIS_URL=...
SENTRY_DSN=...
OTEL_EXPORTER_OTLP_ENDPOINT=...
```

### 6.2 Proceso de deploy

1. Build Docker image
2. `prisma migrate deploy`
3. Start app
4. Wait for `GET /health/ready` → 200
5. Switch traffic

### 6.3 Escalado horizontal (cuándo activar qué)

| Señal | Acción |
|-------|--------|
| 1 instancia, CPU < 60% | No hacer nada |
| CPU > 70% sostenido | Subir RAM/CPU o 2ª réplica |
| 2ª réplica | Activar `REDIS_URL` |
| Push/import lentos | Activar cola (pg-boss o BullMQ) |
| Nearby lento | Fase 4 geo |
| DB connections maxed | Pooler + `connection_limit` en Prisma |

### 6.4 Costo objetivo

| Etapa | Usuarios | Infra/mes (sin Google) |
|-------|----------|------------------------|
| Beta | <500 | $15–25 |
| Crecimiento | 500–5k | $30–50 (+ Redis) |
| Escala | 5k+ | $50–100 (+ pooler, 2 réplicas) |

Google Places suele superar infra si no hay cache — monitorear en Fase 1.

---

## Riesgos y qué NO hacer ahora

| Evitar | Por qué |
|--------|---------|
| Migrar a microservicios | Monolito modular alcanza por mucho |
| Migrar a D1/SQLite | Schema Postgres maduro |
| Redis desde día 1 | Costo innecesario con 1 instancia |
| Reescribir en Workers | Semanas de trabajo, cero beneficio inmediato |
| Big-bang refactor social | Partir con facade + tests primero |

---

## Métricas de éxito del plan

- [ ] CI verde en cada PR
- [ ] ≥60% coverage en `lib/`, ≥3 integration tests
- [ ] `/health/ready` verifica Postgres
- [ ] Logs JSON con `requestId` en prod
- [ ] Cache conmutables in-memory ↔ Redis vía env
- [ ] Ningún archivo >500 líneas (objetivo <400)
- [ ] p95 latencia feed/nearby medible y <500ms
- [ ] Costo infra documentado por etapa de usuarios

---

## Próximo paso inmediato

**Plan completado (Fases 0–6).** Mantener CI verde, ampliar coverage en `src/lib/`, y monitorear latencia/costo en producción según [production-readiness.md](../production-readiness.md).
