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

# Note: HEALTHCHECK is not supported in distroless images because there's no shell
# Use Kubernetes liveness/readiness probes instead, or a sidecar container
# The app exposes /api/v1/health/live and /api/v1/health/ready endpoints

# Start application
# In distroless/nodejs, the entrypoint is already set to node
CMD ["dist/main.js"]
