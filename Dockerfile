# Build stage
FROM node:lts-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production=false

# Copy source and build
COPY . .
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Production stage - using distroless for enhanced security
# gcr.io/distroless/nodejs provides a minimal image with just Node.js runtime
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS production

# Set working directory
WORKDIR /app

# Copy built application from builder
# Note: In distroless, we can't create users or modify permissions at runtime
# The `nonroot` tag already runs as UID 65532
COPY --from=builder --chown=65532:65532 /app/dist ./dist
COPY --from=builder --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=builder --chown=65532:65532 /app/package*.json ./

# Create logs directory in builder and copy
# (Distroless doesn't have mkdir/shell)

# Expose port
EXPOSE 3000

# HEALTHCHECK Configuration:
# Distroless images do not support HEALTHCHECK directive because they lack a shell.
# Instead, Kubernetes liveness and readiness probes are used:
#   - Liveness probe: GET /api/v1/health/live (port 3000)
#   - Readiness probe: GET /api/v1/health/ready (port 3000)
# This approach is the recommended best practice for containerized applications
# and provides more sophisticated health monitoring than Docker's HEALTHCHECK.
#
# Security Note: The `nonroot` tag runs as UID 65532 (nonroot user)
# ensuring the container doesn't run as root, meeting CIS Docker Benchmark requirements.

# Start application
# In distroless/nodejs, the entrypoint is already set to node
CMD ["dist/main.js"]
