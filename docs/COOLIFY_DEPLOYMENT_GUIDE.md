# Coolify Deployment Guide

This guide covers the supported Coolify deployment path for the backend service.

## Recommended Setup

- Build Pack: Docker Compose
- Compose file: [backend/docker-compose.coolify.yml](/Users/mohammadnawfal/Desktop/Archive/softy-erp/backend/docker-compose.coolify.yml)
- Backend image entrypoint: [backend/entrypoint.sh](/Users/mohammadnawfal/Desktop/Archive/softy-erp/backend/entrypoint.sh)
- Migration bootstrap: [backend/src/database/migrate.ts](/Users/mohammadnawfal/Desktop/Archive/softy-erp/backend/src/database/migrate.ts)

Do not set a custom start command or entrypoint override in Coolify. The container startup contract is:

1. `node dist/database/migrate.js`
2. `node dist/main.js`

## Required Environment Variables

For the bundled PostgreSQL service in the provided Compose stack, set these values in Coolify:

- `DB_USERNAME`
- `DB_PASSWORD`
- `DB_DATABASE`
- `JWT_SECRET`
- `PLATFORM_JWT_SECRET`
- `ENCRYPTION_KEY`
- `PASSWORD_RESET_TOKEN_SECRET`
- `CORS_ORIGINS`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET`

The Compose file already wires `DB_HOST=postgres` and `DB_PORT=5432` for the backend container.

Optional tuning variables:

- `DB_WAIT_RETRIES`
- `DB_WAIT_DELAY`
- `MIGRATE_RETRIES`
- `MIGRATE_DELAY`

## First Deployment Steps

1. In Coolify, create a Docker Compose service and point it at [backend/docker-compose.coolify.yml](/Users/mohammadnawfal/Desktop/Archive/softy-erp/backend/docker-compose.coolify.yml).
2. Add the required environment variables in Coolify.
3. Make sure there is no custom start command and no entrypoint override.
4. Deploy the stack.
5. Open the backend container logs directly.
6. Confirm the log sequence shows:
   `Waiting for PostgreSQL`
   `PostgreSQL is reachable.`
   `Running database migrations...`
   `Applied ... migration(s)` or `No pending migrations.`
   `Starting application...`
7. Verify `GET /api/v1/health/live` and `GET /api/v1/health/ready` return `200`.

## How Migrations Work

- The container entrypoint starts the migration bootstrap before the Nest application.
- The migration bootstrap accepts either `DATABASE_URL` or the complete `DB_*` set.
- In the provided Coolify Compose stack, the bundled Postgres path uses the split `DB_*` values.
- `DB_MIGRATIONS_RUN=false` is set in the backend service to avoid a second migration attempt during Nest startup.

## Troubleshooting

### You only see Coolify deployment logs

Those logs show container lifecycle events, not the backend process output. Open the backend service logs directly and inspect the migration bootstrap messages.

### The backend exits before serving traffic

Check the backend container logs for one of these failures:

- `PostgreSQL at ... not reachable after ... attempts.`
- `Migration failed: ...`
- `SECURITY: incomplete DB_* configuration...`
- `SECURITY: DATABASE_URL or complete DB_* configuration is required...`

### Migrations still do not apply

Run a manual recovery command in the backend container:

```bash
npm run migration:run:prod
```

If the app is not built in that shell context, use:

```bash
node dist/database/migrate.js
```

Then verify the migration table in PostgreSQL:

```sql
SELECT id, timestamp, name
FROM migrations
ORDER BY id DESC
LIMIT 10;
```

### Health checks fail after deployment

Use the versioned routes:

- `GET /api/v1/health`
- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`

## Recovery Checklist

1. Confirm the backend service still uses [backend/docker-compose.coolify.yml](/Users/mohammadnawfal/Desktop/Archive/softy-erp/backend/docker-compose.coolify.yml).
2. Remove any custom Coolify start command.
3. Redeploy and inspect backend container logs.
4. Run `npm run migration:run:prod` inside the backend container only if automatic startup failed.
5. Verify the `migrations` table and the health endpoints after recovery.