# Build stage — pin Node 22 (see backend/.nvmrc, RUNBOOK.md)
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies (lockfile must stay compatible with npm 10+ — see package.json packageManager)
COPY package*.json ./
RUN npm install -g npm@11.12.1 \
    && HUSKY=0 NODE_ENV=development npm ci --include=dev

# Copy source and build
COPY . .
RUN NODE_ENV=development npm run build

# Prune dev dependencies
RUN npm prune --omit=dev && npm pkg delete devDependencies scripts.prepare

# Production stage - node:22-alpine for shell support (required for migration entrypoint)
FROM node:22-alpine AS production

# Set working directory
WORKDIR /app

# Create a non-root user matching the UID used by the former distroless nonroot image.
# This preserves the same security posture (CIS Docker Benchmark CKV_DOCKER_3).
RUN addgroup -g 65532 -S nonroot && adduser -u 65532 -S nonroot -G nonroot

# Copy built application from builder
COPY --from=builder --chown=65532:65532 /app/dist ./dist
COPY --from=builder --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=builder --chown=65532:65532 /app/package*.json ./

# Create writable logs directory for Winston file transport (production)
RUN mkdir -p /app/logs && chown 65532:65532 /app/logs

# Copy entrypoint: wait-or-migrate (see RUN_MIGRATIONS_ON_BOOT), then start app
COPY --chown=65532:65532 entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Expose port
EXPOSE 3000

# Health check via HTTP (Coolify / Docker Compose compatible).
# Kubernetes deployments should use the liveness/readiness probes instead:
#   - Liveness probe:  GET /api/v1/health/live  (port 3000)
#   - Readiness probe: GET /api/v1/health/ready (port 3000)
# start-period covers DB wait + migrate-or-poll + Nest boot (must exceed worst-case wait).
HEALTHCHECK --interval=10s --timeout=5s --start-period=240s --retries=5 \
  CMD wget -qO- http://localhost:3000/api/v1/health/live || exit 1

USER 65532

# Entrypoint: wait-for-migrations (default) or migrate when RUN_MIGRATIONS_ON_BOOT=true.
# Admin one-off: node dist/database/migrate.js
# `exec` replaces the shell process so SIGTERM is forwarded correctly.
ENTRYPOINT ["./entrypoint.sh"]
