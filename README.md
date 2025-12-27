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
| **Swagger Docs** | http://localhost:3000/api/docs | Interactive API documentation |
| **Health Check** | http://localhost:3000/api/v1/health | Full health status |
| **Liveness Probe** | http://localhost:3000/api/v1/health/live | K8s liveness check |
| **Readiness Probe** | http://localhost:3000/api/v1/health/ready | K8s readiness check |
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

### Production Infrastructure
- ✅ **Rate Limiting** - ThrottlerGuard with tiered limits
- ✅ **Health Checks** - Terminus-based DB/memory checks
- ✅ **Graceful Shutdown** - Clean connection closure
- ✅ **Structured Logging** - Winston with JSON format
- ✅ **Sensitive Data Filtering** - Auto-redacts passwords/tokens
- ✅ **Correlation IDs** - X-Correlation-ID header tracking
- ✅ **Database Migrations** - TypeORM migration support
- ✅ **Backups** - pg_dump with MinIO upload
- ✅ **Telemetry** - OpenTelemetry + Zipkin
- ✅ **Load Testing** - k6 test scripts
- ✅ **Sentry** - Error tracking & alerting
- ✅ **Redis Cache** - In-memory caching layer
- ✅ **Docker** - Multi-stage production image
- ✅ **CI/CD** - GitHub Actions pipelines

## 🛠 Scripts

```bash
# Development
npm run start:dev          # Start with hot-reload
npm run build              # Build for production
npm run start:prod         # Start production build

# Testing
npm run test               # Run unit tests
npm run test:e2e           # Run E2E tests
npm run test:cov           # Test coverage
npm run load-test          # Run k6 load tests

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
| `TEST_ERROR_KEY` | - | Key for triggering test errors |

### Redis Cache

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | redis://localhost:6379 | Redis connection URL |

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
