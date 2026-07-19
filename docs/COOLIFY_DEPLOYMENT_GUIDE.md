# Coolify Deployment Guide (Backend)

Production hosting path for the Nest backend. Soft infra (Postgres, Redis, Garage) live as **Coolify-managed standalone resources**. This compose file runs **backend only**, with memory/CPU limits so a bad boot cannot OOM the Coolify host.

See also: root [RUNBOOK.md](../../RUNBOOK.md).

---

## Architecture

```text
Coolify host
├── Coolify dashboard (must stay healthy)
├── Managed Postgres (Coolify resource)
├── Managed Redis (Coolify resource)
├── Managed Garage (S3-compatible; Coolify resource)
└── Backend compose (backend/docker-compose.coolify.yml)
    └── backend  (mem_limit 768M, cpus 1.0)
```

Do **not** add Postgres/Redis/MinIO back into `docker-compose.coolify.yml`. Bundling them with the Nest build on a small VPS previously starved Coolify itself (dashboard stopped responding).

---

## One-time: Coolify resources

In Coolify UI, create and attach to the **same project/network** as the backend app:

1. **PostgreSQL** — note internal hostname (often the resource UUID / container name, e.g. `kgztg6…`), port, user, password, database name.
2. **Redis** — note connection URL (`redis://...`).
3. **Garage** (or any S3 path-style endpoint) — create bucket + access/secret keys; note API endpoint.

Wire those values into the backend resource Environment Variables (table below).

`docker-compose.coolify.yml` joins the external **`coolify`** Docker network so the backend can reach managed Postgres/Redis by container name. If deploy fails with `network coolify declared as external but could not be found`, create/attach via Coolify UI or run `docker network ls` on the host and rename the external network in compose to match.

---

## Backend Coolify resource

1. Create a **Docker Compose** resource (preferred) **or** Dockerfile Application.
2. **Base Directory:** `backend` (compose) / repo root if backend is the Coolify root.
3. **Compose file:** `docker-compose.coolify.yml` (compose pack).
4. Set env vars (never commit secrets). Mark secrets **Runtime only** — uncheck **Available at Buildtime** so Coolify does not inject them as Dockerfile `ARG` (leaks into build logs / image layers).

| Variable | Required | Notes |
|----------|----------|--------|
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` | Yes* | Coolify-managed Postgres. *Or* set `DATABASE_URL` instead of the split set. |
| `REDIS_URL` | Yes | Coolify-managed Redis |
| `S3_ENDPOINT` | Yes | Garage (or MinIO) API URL, e.g. `http://garage:3900` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Yes | Garage keys |
| `S3_BUCKET` | Yes | Bucket created in Garage |
| `S3_REGION` | No | Default `garage` |
| `JWT_SECRET` | Yes | `openssl rand -base64 32` — **runtime only** |
| `PLATFORM_JWT_SECRET` | Yes | **runtime only** |
| `PASSWORD_RESET_TOKEN_SECRET` | Yes | **runtime only** |
| `ENCRYPTION_KEY` | Yes | ≥32 chars — **runtime only** |
| `CORS_ORIGINS` | Yes | Comma-separated frontend origins |
| `RUN_MIGRATIONS_ON_BOOT` | Yes (Dockerfile Application) | `true` so entrypoint applies migrations before Nest |
| `PAYOUT_GATEWAY` | Yes (prod) | `disabled` until a real bank/ACH gateway is wired |
| `MIGRATION_WAIT_RETRIES` | Recommended | `30` (not `60`) so wait ≤ HEALTHCHECK `start-period` 240s |
| `MIGRATION_WAIT_DELAY` | Recommended | `5` |
| `NODE_ENV` | Yes | `production` — **runtime only** (build stage forces development for `npm ci`/`build`) |

5. Do **not** override the image entrypoint or start command.
6. Migrations: either apply out-of-band (compose `migrate` profile) **or** set `RUN_MIGRATIONS_ON_BOOT=true` for Dockerfile Application (next section).
7. Keep **replicas = 1** while `RUN_MIGRATIONS_ON_BOOT=true` (avoid concurrent migrate races).

### Coolify Dockerfile Application checklist (before every redeploy)

| Setting | Value |
|---------|--------|
| `RUN_MIGRATIONS_ON_BOOT` | `true` (runtime) |
| `PAYOUT_GATEWAY` | `disabled` |
| `MIGRATION_WAIT_RETRIES` | `30` |
| Secrets (JWT, DB, encryption, seed passwords, …) | Runtime only — never Buildtime |
| Replicas | `1` while boot-migrate on |

Resource limits in compose (`mem_limit: 768M`, `cpus: 1.0`) are a starting point — raise if the app OOMs under load, but leave headroom for Coolify + managed DBs.

---

## Migrations

### Dockerfile Application (Coolify) — recommended for this hosting path

Coolify pre/post-deploy hooks need a **healthy** (or existing) container. First deploy has neither → migrate hooks skip → healthcheck kills wait-loop. Fix:

1. Add runtime env **`RUN_MIGRATIONS_ON_BOOT=true`** (not build-time).
2. Keep **replicas = 1** while boot-migrate is on (avoid concurrent `runMigrations`).
3. Keep `DB_MIGRATIONS_RUN=false` (TypeORM Nest-boot migrate stays off).
4. Redeploy. Logs should show `RUN_MIGRATIONS_ON_BOOT=true` → `Running database migrations...` → `Starting application...`.

Unset / set `false` if you switch back to out-of-band migrate.

### Compose — devops one-off (default)

Without `RUN_MIGRATIONS_ON_BOOT`, the `backend` container **does not** run migrations. Entrypoint (`wait-for-migrations.js`) polls until schema has no pending migrations, then starts Nest. Devops applies migrations out-of-band via the dedicated `migrate` service.

### Why a dedicated migrate service (not `Execute Command`)

The backend entrypoint blocks until schema is ready, so the app container may be mid-wait or restarting — an unreliable `Execute Command` target. The `migrate` service in `docker-compose.coolify.yml` is **profile-gated** (`profiles: ['migrate']`), so a normal deploy never starts it, and it **overrides the entrypoint** to run migrations directly (no wait). `restart: 'no'` means it applies migrations once and exits — never crash-loops.

### Apply migrations (run this BEFORE / at release)

From the Coolify server host terminal, in the backend project directory:

```bash
docker compose -f docker-compose.coolify.yml --profile migrate run --rm migrate
```

This waits for Postgres, applies pending migrations, validates runtime schema, then exits 0. Equivalent from a built tree elsewhere: `npm run migration:run:prod`.

Confirm logs show `Applied ... migration(s)` or `No pending migrations.`, then (re)deploy / start the backend. Its wait gate sees zero pending and boots.

> Coolify note: for a compose stack there is **no** Pre/Post-deploy command field (that exists only for Nixpacks/Dockerfile *Application* resources). The profile-gated `migrate` service is the supported path. If you instead want migrations to run automatically inside the deployed stack, make the service non-profiled and add the Coolify-only field `exclude_from_hc: true` (plus `restart: 'no'`) so the exited container is not flagged unhealthy — but that reintroduces auto-migrate, which this setup intentionally avoids.

### Boot sequence (healthy backend logs)

Wait path (default):

```text
Waiting for PostgreSQL at ...
PostgreSQL is reachable.
Waiting for database migrations to be applied by devops ...
No pending migrations. Schema is ready.
Starting application...
```

Boot-migrate path (`RUN_MIGRATIONS_ON_BOOT=true`):

```text
RUN_MIGRATIONS_ON_BOOT=true — applying migrations before start...
Waiting for PostgreSQL at ...
PostgreSQL is reachable.
Running database migrations...
Applied N migration(s): ...   # or: No pending migrations.
Starting application...
```

If wait path and devops has not migrated yet, logs repeat `pending migrations still present` until timeout, then exit 1.

### Timing (avoids the restart storm)

Worst-case wait path = DB wait (`DB_WAIT_RETRIES`×`DB_WAIT_DELAY`, default 30×2 = 60s) + migration wait (`MIGRATION_WAIT_RETRIES`×`MIGRATION_WAIT_DELAY`, default **30**×5 = 150s) = **210s**. Image `HEALTHCHECK` `start-period` is **240s**.

Set Coolify `MIGRATION_WAIT_RETRIES=30` (not `60`). A value of `60` yields 300s > start-period and Coolify can mark the container unhealthy while still waiting. Keep Coolify health start period ≥ 240s (or disable healthcheck only for emergency). Boot-migrate path is usually much shorter (DB wait + migrate).

---

## Health checks

| Probe | Path | Role |
|-------|------|------|
| Liveness | `GET /api/v1/health/live` | Process up (Docker/Coolify healthcheck) |
| Readiness | `GET /api/v1/health/ready` | DB reachable |

Storage health uses `S3_*` (Garage) on the detailed/deep endpoints — path-style (`forcePathStyle: true`) matches Garage.

---

## Rollback notes

- App-only rollback: redeploy previous Coolify build (schema unchanged).
- Schema rollback is **manual** — see [runbooks/db-rollback.md](./runbooks/db-rollback.md). Migrations are never auto-reverted.
- Always take a backup before risky migrate: `backend/scripts/backup.sh`.
