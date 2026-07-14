# Operations Guide

Production deployment and operations guide for the softY ERP system.

---

## Required Environment Variables

The following environment variables must be configured before starting the application:

### Core Configuration

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NODE_ENV` | Yes | Environment mode | `production`, `development` |
| `PORT` | No | HTTP server port (default: 3000) | `3000` |
| `DATABASE_URL` | Yes* | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Yes | JWT signing key (min 32 chars) | Random secure string |
| `JWT_EXPIRES_IN` | No | Token expiration (default: 1h) | `1h`, `24h` |

### Database Configuration (Alternative to DATABASE_URL)

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_HOST` | Yes* | PostgreSQL host |
| `DB_PORT` | No | PostgreSQL port (default: 5432) |
| `DB_USERNAME` | Yes* | Database username |
| `DB_PASSWORD` | Yes* | Database password |
| `DB_DATABASE` | Yes* | Database name |

*Use either `DATABASE_URL` or the full `DB_HOST` / `DB_PORT` / `DB_USERNAME` /
`DB_PASSWORD` / `DB_DATABASE` set. In the Coolify Docker Compose deployment,
the bundled PostgreSQL service uses the split `DB_*` variables.

### Security & Encryption

| Variable | Required | Description |
|----------|----------|-------------|
| `ENCRYPTION_KEY` | Yes (Prod) | AES-256 encryption key for sensitive data (min 32 chars) |
| `CORS_ORIGINS` | Yes (Prod) | Comma-separated list of allowed origins |
| `ACCOUNT_LOCKOUT_THRESHOLD` | No | Failed logins before lockout (default: 5) |
| `ACCOUNT_LOCKOUT_DURATION_MINUTES` | No | Lockout duration (default: 15) |

### External Services

| Variable | Required | Description |
|----------|----------|-------------|
| `SMTP_HOST` | Yes | SMTP server for emails |
| `SMTP_PORT` | No | SMTP port (default: 587) |
| `SMTP_USER` | Yes | SMTP username |
| `SMTP_PASS` | Yes | SMTP password |
| `S3_ENDPOINT` | Yes (Prod storage) | Garage/S3 endpoint (path-style) |
| `S3_ACCESS_KEY` | Yes (Prod storage) | S3 access key |
| `S3_SECRET_KEY` | Yes (Prod storage) | S3 secret key |
| `S3_BUCKET` | Yes (Prod storage) | Default bucket name |
| `S3_REGION` | No | Default `garage` (or provider region) |

### Observability

| Variable | Required | Description |
|----------|----------|-------------|
| `SENTRY_DSN` | No | Sentry error tracking DSN |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | OpenTelemetry collector endpoint |

### HashiCorp Vault (Optional)

| Variable | Required | Description |
|----------|----------|-------------|
| `VAULT_ADDR` | No | Vault server address |
| `VAULT_TOKEN` | No | Vault access token |
| `VAULT_PATH` | No | Secret path in Vault |

---

## Health Check Endpoints

The application exposes health check endpoints for Kubernetes probes:

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `GET /api/v1/health` | Combined health check | `{ status: 'ok', info: {...} }` |
| `GET /api/v1/health/live` | Liveness probe | `200 OK` if app is running |
| `GET /api/v1/health/ready` | Readiness probe | `200 OK` if dependencies ready |

### Health Check Components

- **Database**: PostgreSQL connectivity
- **SMTP**: Mail server availability (non-critical)
- **Storage**: Garage/S3 connectivity (`S3_*` env)

---

## Startup Checklist

Before deploying to production:

1. **Environment Variables**
   - [x] All required variables in table above are set
   - [x] `NODE_ENV=production` is configured
   - [x] `ENCRYPTION_KEY` is set (min 32 random characters)
   - [x] `CORS_ORIGINS` is restricted to known origins

2. **Database**
   - [x] PostgreSQL is accessible (Coolify-managed resource recommended)
   - [x] Choose one DB config shape: `DATABASE_URL` or the full `DB_*` set
   - [x] If using Docker or Coolify, do not override the container entrypoint; default waits for migrations (or set `RUN_MIGRATIONS_ON_BOOT=true` for Dockerfile Coolify)
   - [x] Devops applies schema with `npm run migration:run:prod` / `node dist/database/migrate.js` before/at release
   - [x] Database user has appropriate permissions

3. **External Services**
   - [x] SMTP server is reachable and credentials valid
   - [x] Garage/S3 bucket exists and `S3_*` credentials valid
   - [x] (Optional) Vault is accessible and token valid

4. **Security**
   - [x] JWT_SECRET is unique and secure (not shared across environments)
   - [x] HTTPS is enforced at load balancer/ingress level
   - [x] Rate limiting is configured

5. **Observability**
   - [x] Health endpoints are accessible to orchestrator
   - [x] Logs are being collected (structured JSON)
   - [x] (Optional) Sentry and OpenTelemetry configured

6. **Dependency Security**
   - [x] Run `npm audit` (or `npm audit --production`) and address high/critical issues
   - [x] If fixes are applied, re-run tests and update lockfile checks

## Coolify / Docker Compose Deployments

Use [backend/docs/COOLIFY_DEPLOYMENT_GUIDE.md](./COOLIFY_DEPLOYMENT_GUIDE.md) as the primary runbook for this hosting path.

Operational notes:

- Point Coolify at [backend/docker-compose.coolify.yml](../docker-compose.coolify.yml). Compose is **backend-only**; Postgres, Redis, and Garage are Coolify-managed resources.
- Do not set a custom start command or entrypoint override in Coolify.
- Default entrypoint: `wait-for-migrations.js` then Nest. Compose path: devops runs profile `migrate` (or `node dist/database/migrate.js`) out-of-band.
- Dockerfile Application (Coolify): set `RUN_MIGRATIONS_ON_BOOT=true` (runtime) so entrypoint runs `migrate.js` then Nest. Keep **one replica**. Keep `DB_MIGRATIONS_RUN=false`.
- Check container logs, not only Coolify deploy log. Boot-migrate: `RUN_MIGRATIONS_ON_BOOT=true` → `Running database migrations...` → `Starting application...`. Wait path: `Waiting for PostgreSQL` → `No pending migrations. Schema is ready.` → `Starting application...`.
- Verify liveness at `GET /api/v1/health/live` after startup.

---

## Graceful Shutdown

The application handles `SIGTERM` signals for graceful shutdown:

1. Stops accepting new connections
2. Waits for in-flight requests (30s timeout)
3. Closes database connections
4. Exits cleanly

This is critical for Kubernetes rolling deployments.

---

## Tenant Context

### How It Works

Tenant isolation is enforced via `TenantContextService` which uses Node.js `AsyncLocalStorage` to propagate the tenant ID across async operations:

1. `TenantMiddleware` extracts `tenantId` from JWT token
2. Sets context via `TenantContextService.run(tenantId, callback)`
3. All downstream code accesses `TenantContextService.getTenantId()`
4. `TenantAwareRepository` automatically scopes queries

### Injectable Alternative

For dependency injection and easier testing, use `TenantContextProvider`:

```typescript
constructor(private tenantContext: TenantContextProvider) {}

const tenantId = this.tenantContext.getTenantId();
const requiredTenantId = this.tenantContext.getRequiredTenantId(); // throws if missing
```

### Rules

- Never access data without tenant context
- `BaseTenantEntity` includes `tenantId` column on all tenant-scoped entities
- Multi-tenant queries must always filter by `tenantId`

---

## Staging Deployment

### Deploy to Staging

```bash
# 1. Ensure all tests pass
npm run test
npm run test:e2e

# 2. Build production image
docker build -t softy-erp:staging .

# 3. Push to registry
docker tag softy-erp:staging your-registry.com/softy-erp:staging
docker push your-registry.com/softy-erp:staging

# 4. Deploy via Helm (Kubernetes)
helm upgrade --install staging ./charts/softy-erp \
  --namespace staging \
  -f values.staging.yaml
```

### Load Testing

```bash
# Install k6
brew install k6

# Run smoke test first
k6 run --vus 1 --iterations 1 load-tests/api-load-test.js

# Run full load test
SEED_ADMIN_PASSWORD=your_password k6 run load-tests/api-load-test.js
```

### Post-Deployment Verification

1. Check health endpoint: `curl https://staging.example.com/api/v1/health`
2. Verify liveness: `curl https://staging.example.com/api/v1/health/live`
3. Verify readiness: `curl https://staging.example.com/api/v1/health/ready`
4. Monitor logs for errors
5. Run smoke test against staging

