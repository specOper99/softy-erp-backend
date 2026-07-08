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

1. **PostgreSQL** — note internal hostname, port, user, password, database name.
2. **Redis** — note connection URL (`redis://...`).
3. **Garage** (or any S3 path-style endpoint) — create bucket + access/secret keys; note API endpoint.

Wire those values into the backend resource Environment Variables (table below).

---

## Backend Coolify resource

1. Create a **Docker Compose** resource.
2. **Base Directory:** `backend`.
3. **Compose file:** `docker-compose.coolify.yml`.
4. Set env vars (never commit secrets):

| Variable | Required | Notes |
|----------|----------|--------|
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` | Yes* | Coolify-managed Postgres. *Or* set `DATABASE_URL` instead of the split set. |
| `REDIS_URL` | Yes | Coolify-managed Redis |
| `S3_ENDPOINT` | Yes | Garage (or MinIO) API URL, e.g. `http://garage:3900` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Yes | Garage keys |
| `S3_BUCKET` | Yes | Bucket created in Garage |
| `S3_REGION` | No | Default `garage` |
| `JWT_SECRET` | Yes | `openssl rand -base64 32` |
| `PLATFORM_JWT_SECRET` | Yes | |
| `PASSWORD_RESET_TOKEN_SECRET` | Yes | |
| `ENCRYPTION_KEY` | Yes | ≥32 chars |
| `CORS_ORIGINS` | Yes | Comma-separated frontend origins |

5. Do **not** override the image entrypoint or start command.
6. Deploy is safe only **after** migrations have been applied (next section).

Resource limits in compose (`mem_limit: 768M`, `cpus: 1.0`) are a starting point — raise if the app OOMs under load, but leave headroom for Coolify + managed DBs.

---

## Migrations (devops one-off)

The `backend` container **does not** run migrations. Its entrypoint (`wait-for-migrations.js`) polls until schema has no pending migrations, then starts Nest. Devops applies migrations out-of-band via the dedicated `migrate` service.

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

```text
Waiting for PostgreSQL at ...
PostgreSQL is reachable.
Waiting for database migrations to be applied by devops ...
No pending migrations. Schema is ready.
Starting application...
```

If devops has not migrated yet, logs repeat `pending migrations still present` until timeout, then exit 1.

### Timing (avoids the restart storm)

Worst-case entrypoint wait = DB wait (`DB_WAIT_RETRIES`×`DB_WAIT_DELAY`, default 30×2 = 60s) + migration wait (`MIGRATION_WAIT_RETRIES`×`MIGRATION_WAIT_DELAY`, default 30×5 = 150s) = **210s**. Healthcheck `start_period` is **240s** so the liveness probe never fails the container mid-wait. Keep `start_period > total wait`; if you raise the wait envs, raise `start_period` to match, or the container will be killed and restart-loop.

Tune wait via env: `DB_WAIT_RETRIES`, `DB_WAIT_DELAY`, `MIGRATION_WAIT_RETRIES`, `MIGRATION_WAIT_DELAY`.

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
