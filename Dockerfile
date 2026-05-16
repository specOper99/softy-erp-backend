# Build stage
FROM node:lts-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN HUSKY=0 npm ci --include=dev

# Copy source and build
COPY . .
RUN npm run build

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

# Copy entrypoint script that runs migrations then starts the app
COPY --chown=65532:65532 entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Expose port
EXPOSE 3000

# Health check via HTTP (Coolify / Docker Compose compatible).
# Kubernetes deployments should use the liveness/readiness probes instead:
#   - Liveness probe:  GET /api/v1/health/live  (port 3000)
#   - Readiness probe: GET /api/v1/health/ready (port 3000)
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health/live || exit 1

USER 65532

# Entrypoint runs pending migrations, then starts the app.
# `exec` replaces the shell process so SIGTERM is forwarded correctly.
ENTRYPOINT ["./entrypoint.sh"]
