# 🎬 Chapters Studio ERP

A production-ready NestJS ERP backend for photography/videography studio management.

## 🚀 Quick Start

```bash
# 1. Start infrastructure (PostgreSQL + MinIO + Redis)
docker compose up -d

# 2. Install dependencies
npm install

# 3. Copy environment file and update it with your configuration
cp .env.example .env

# 4. Start development server
npm run start:dev
```

## 🔗 Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| **API Server** | http://localhost:3000/api/v1 | REST API base |
| **Swagger Docs** | http://localhost:3000/api/docs | Interactive API documentation (requires `ENABLE_SWAGGER=true`) |
| **Health Check** | http://localhost:3000/api/v1/health | Full health status |
| **Liveness Probe** | http://localhost:3000/api/v1/health/live | K8s liveness check |
| **Readiness Probe** | http://localhost:3000/api/v1/health/ready | K8s readiness check |
| **Prometheus Metrics** | http://localhost:3000/api/v1/metrics | Prometheus scrape endpoint (token-protected in production) |
| **MinIO Console** | http://localhost:9001 | Object storage admin (minioadmin/minioadmin) |
| **Zipkin UI** | http://localhost:9411 | Distributed tracing (optional) |

## 📦 Features

### Core Modules
- **Auth** - JWT authentication with refresh tokens
- **Users** - User management with roles (ADMIN, OPS_MANAGER, FIELD_STAFF)
- **Bookings** - Client booking management
- **Tasks** - Work task assignment and tracking
- **Catalog** - Service packages and task types
- **Finance** - Transactions and employee wallets
- **HR** - Employee profiles and payroll
- **Media** - File uploads via MinIO/S3

### New Features (v1.1)
- **Client Portal** - Magic link authentication for clients to view bookings and profile
- **Multi-language (i18n)** - Support for English, Arabic, Kurdish, and French
- **Dashboard Analytics** - KPIs, revenue stats, booking trends, CSV/PDF export


### Production Infrastructure & Security Hardening
- 🛡️ **Composite FK Constraints** - Database-level tenant isolation enforcing cross-tenant referential integrity.
- 🛡️ **Helmet Security** - Essential HTTP security headers applied globally.
- 🛡️ **JWT-Only Auth** - Removed header-based tenant identification; tenant scope derived solely from verified JWTs.
- 🛡️ **PII Masking** - Specialized `@PII` decorator ensuring sensitive fields (emails, phones) are masked in structured logs.
- 🛡️ **Stored XSS Protection** - `@SanitizeHtml` decorator for automatic sanitization of user-provided content.
- 🛡️ **Account Lockout** - Progressive account locking to thwart brute-force attacks.
- 🛡️ **Rate Limiting** - Advanced `IpRateLimitGuard` with IP-based throttling.
- 🛡️ **Encrypted Secrets** - Webhook secrets encrypted at rest using AES-256-GCM.
- ✅ **Health Checks** - Terminus-based DB, Redis, and Memory probes.
- ✅ **Structured Logging** - Winston-based JSON logs including correlation IDs and tenant context.
- ✅ **Telemetry** - OpenTelemetry + Zipkin for distributed tracing.
- ✅ **Database Migrations** - Robust TypeORM migration system for schema evolution.
- ✅ **Secrets Management** - Integrated support for HashiCorp Vault.
- ✅ **Docker** - Optimized multi-stage production images using `node:alpine`.
- ✅ **CI/CD** - Automated pipelines for Lint, Test, and Container publishing.

### Tenant Context

The system uses `AsyncLocalStorage` for tenant context propagation, ensuring all database queries are tenant-scoped:

- **Static API**: `TenantContextService.getTenantId()` - Direct access (used internally)
- **Injectable API**: `TenantContextProvider` - DI-friendly wrapper for easier testing

See [OPERATIONS.md](./OPERATIONS.md) for production deployment guide, environment variables, and health checks.

## 🛠 Scripts

```bash
# Development
npm run start:dev          # Start with hot-reload
npm run build              # Build for production
npm run start:prod         # Start production build

# Testing
npm run test               # Run unit tests
npm run test:integration   # Run integration tests with testcontainers
npm run test:e2e           # Run E2E tests
npm run test:cov           # Test coverage
npm run test:integration:cov # Integration test coverage

# Performance Testing
npm run test:load:auth     # Load test authentication flow
npm run test:load:booking  # Load test booking workflow
npm run test:load:finance  # Load test finance operations
npm run test:load:stress   # Stress test (500 concurrent users)
npm run test:load:all      # Run all load tests

# Database
npm run seed               # Seed database with sample data
npm run migration:generate # Generate migration from changes
npm run migration:run      # Apply pending migrations
npm run migration:revert   # Rollback last migration

# Maintenance
npm run backup             # Create database backup
npm run format             # Format code with Prettier
npm run lint               # Lint code with ESLint
```

## 🔒 Security Scanning

Automated security scanning is integrated into the CI/CD pipeline:

- **npm audit**: Scans for critical vulnerabilities in dependencies (fails build on critical findings)
- **Snyk**: Deep dependency analysis with severity thresholds (requires `SNYK_TOKEN` in GitHub secrets)
- **Security reports**: Generated as GitHub Actions artifacts

Run manually:
```bash
npm audit --audit-level=critical
```

## 🧪 Integration Testing

Comprehensive integration tests using **testcontainers** for real database testing:

### Features
- Real PostgreSQL instances via Docker containers
- Multi-tenant data isolation verification
- Composite foreign key constraint testing
- Transaction rollback scenarios
- Complex query and pagination testing

### Running Integration Tests
```bash
# Run integration tests (Docker required)
npm run test:integration

# With coverage
npm run test:integration:cov
```

### Test Coverage
- **Repositories**: Bookings, Tasks, Finance
- **Multi-tenant isolation**: Cross-tenant data access prevention
- **Database constraints**: FK constraints, check constraints
- **Transactions**: Atomic operations and rollback testing

## 📊 Performance Testing

K6 load testing scenarios with defined SLOs:

### Test Scenarios

#### 1. Authentication Flow (`test:load:auth`)
- **SLOs**: p95 < 200ms, p99 < 500ms, error rate < 1%
- **Load**: Ramps up to 100 concurrent users
- **Tests**: Login, token refresh, rate limiting, profile access

#### 2. Booking Flow (`test:load:booking`)
- **SLOs**: p95 < 300ms, p99 < 800ms, error rate < 1%
- **Load**: Ramps up to 150 concurrent users
- **Tests**: Booking creation, updates, task assignment, cancellation

#### 3. Finance Flow (`test:load:finance`)
- **SLOs**: p95 < 250ms, transaction accuracy: 100%
- **Load**: Ramps up to 120 concurrent users
- **Tests**: Transaction creation, revenue calculation, balance queries

#### 4. Stress Test (`test:load:stress`)
- **Objective**: Identify system breaking points
- **Load**: Gradual ramp to 500 concurrent users over 30 minutes
- **Output**: Detailed breaking point analysis and capacity recommendations

### Running Load Tests
```bash
# Individual scenarios
npm run test:load:auth
npm run test:load:booking
npm run test:load:finance

# Stress test
npm run test:load:stress

# All scenarios
npm run test:load:all
```

### Reports
HTML reports are generated in `scripts/load-testing/reports/` with:
- Response time percentiles
- Success rates and error analysis
- SLO compliance status
- Capacity recommendations (stress test)
```

## 🐳 Docker

### Development
```bash
# Start core services (PostgreSQL + MinIO + Redis)
docker compose up -d

# Start with telemetry (adds Zipkin)
docker compose --profile telemetry up -d
```

### Production
```bash
# Build production image
docker build -t chapters-studio-erp .

# Run container
docker run -p 3000:3000 --env-file .env chapters-studio-erp
```

## 🔄 CI/CD

GitHub Actions workflows are included:

- **CI** (`.github/workflows/ci.yml`)
  - Runs on every PR to main/develop
  - Lint → Test → Build → Docker build

- **Deploy** (`.github/workflows/deploy.yml`)
  - Runs on push to main or version tags
  - Builds and pushes to GitHub Container Registry

- **Security Scanning** (part of CI)
  - npm audit for critical vulnerabilities
  - Snyk security scanning (requires SNYK_TOKEN)
  - Fails build on high-severity issues

## 🔐 Environment Variables

Copy `.env.example` to `.env` and configure the following variables:

### Application

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | development | Environment mode (`development`, `production`, `test`) |
| `PORT` | 3000 | API server port |

### Database (PostgreSQL)

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | localhost | PostgreSQL host |
| `DB_PORT` | 5434 | PostgreSQL port |
| `DB_USERNAME` | - | PostgreSQL username (required) |
| `DB_PASSWORD` | - | PostgreSQL password (required) |
| `DB_DATABASE` | - | PostgreSQL database name (required) |
| `DB_SYNCHRONIZE` | true | Auto-sync schema (disable in production) |
| `DB_LOGGING` | false | Enable SQL query logging |

### Authentication (JWT)

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | - | JWT signing secret (required) |
| `JWT_ACCESS_EXPIRES_SECONDS` | 900 | Access token expiry (15 min) |
| `JWT_REFRESH_EXPIRES_DAYS` | 7 | Refresh token expiry (7 days) |

### MinIO / S3 Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `MINIO_ENDPOINT` | http://localhost:9000 | MinIO/S3 endpoint URL |
| `MINIO_BUCKET` | chapters-studio | Bucket name for file storage |
| `MINIO_REGION` | us-east-1 | S3 region |
| `MINIO_ACCESS_KEY` | - | MinIO/S3 access key (required) |
| `MINIO_SECRET_KEY` | - | MinIO/S3 secret key (required) |
| `MINIO_PUBLIC_URL` | http://localhost:9000 | Public URL for file access |

### Email (SMTP)

| Variable | Default | Description |
|----------|---------|-------------|
| `MAIL_HOST` | - | SMTP server host |
| `MAIL_PORT` | 587 | SMTP server port |
| `MAIL_USER` | - | SMTP username |
| `MAIL_PASSWORD` | - | SMTP password |
| `MAIL_FROM` | - | Default "From" address |

### Telemetry & Monitoring

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_ENABLED` | false | Enable OpenTelemetry tracing |
| `ZIPKIN_ENDPOINT` | http://localhost:9411/api/v2/spans | Zipkin collector URL |
| `SENTRY_DSN` | - | Sentry error tracking DSN |
| `METRICS_TOKEN` | - | If set, `/api/v1/metrics` requires `Authorization: Bearer <token>` (in production, unset disables metrics with 404) |
| `TEST_ERROR_KEY` | - | Key for triggering test errors |

### Redis Cache

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | redis://localhost:6379 | Redis connection URL |

### HashiCorp Vault (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `VAULT_ENABLED` | false | Enable Vault secret loading |
| `VAULT_ADDR` | - | Vault server address (e.g., `http://localhost:8200`) |
| `VAULT_TOKEN` | - | Vault authentication token |
| `VAULT_SECRET_PATH` | - | Path to secrets (e.g., `secret/data/myapp`) |

### Backup & Seeding

| Variable | Default | Description |
|----------|---------|-------------|
| `UPLOAD_TO_MINIO` | false | Upload backups to MinIO |
| `SEED_ADMIN_PASSWORD` | - | Admin password for seeding (required for `npm run seed`) |
| `SEED_STAFF_PASSWORD` | - | Staff password for seeding (required for `npm run seed`) |
| `SEED_OPS_PASSWORD` | - | Ops manager password for seeding (required for `npm run seed`) |

### Testing (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_MOCK_PASSWORD` | - | Mock password for unit tests |
| `TEST_MOCK_PASSWORD_WRONG` | - | Wrong mock password for unit tests |

## 📊 API Rate Limits

| Tier | Limit | Scope |
|------|-------|-------|
| Short | 3 req/sec | Per IP |
| Medium | 20 req/10sec | Per IP |
| Long | 100 req/min | Per IP |
| Auth endpoints | 5 req/min | Login/Register |

## 🗄️ API Versioning

The API uses URL-based versioning:

```
/api/v1/...  ← Current version
/api/v2/...  ← Future version (when needed)
```

To add a new API version:
1. Create `src/modules/v2/` directory
2. Add version-specific modules/controllers
3. Configure separate route prefix in `main.ts`

## 🏗 Project Structure

```
src/
├── common/           # Shared utilities
│   ├── cache/        # Redis caching
│   ├── decorators/   # Custom decorators
│   ├── filters/      # Exception filters
│   ├── interceptors/ # Response transformers
│   ├── logger/       # Winston logging
│   ├── middleware/   # Correlation ID
│   ├── sentry/       # Error tracking
│   └── telemetry/    # OpenTelemetry
├── config/           # Configuration
├── database/         # Migrations & seeds
└── modules/          # Feature modules
    ├── auth/
    ├── bookings/
    ├── catalog/
    ├── dashboard/
    ├── finance/
    ├── health/
    ├── hr/
    ├── mail/
    ├── media/
    ├── tasks/
    └── users/

.github/
└── workflows/
    ├── ci.yml        # CI pipeline
    └── deploy.yml    # Deployment pipeline
```

## 📝 License

MIT
