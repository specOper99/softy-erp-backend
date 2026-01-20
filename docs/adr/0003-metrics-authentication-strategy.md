# 3. Metrics Authentication Strategy

Date: 2026-01-17

## Status

Accepted

## Context

Our Prometheus `/metrics` endpoint exposes internal application metrics including request counts, latencies, database query durations, and other operational data. Without proper authentication:

1. **Information Disclosure**: Attackers can learn about system architecture and performance characteristics
2. **Denial of Service**: Repeated metric scraping can degrade performance
3. **Reconnaissance**: Metric data can reveal vulnerable endpoints or slow queries

Previously, the metrics endpoint had optional bearer token authentication via `METRICS_TOKEN` environment variable, but it was not enforced in production.

## Decision

We will enforce mandatory bearer token authentication for the metrics endpoint in production:

1. **Guard-based Authentication**: Create a dedicated `MetricsGuard` that validates the `Authorization: Bearer <token>` header using timing-safe comparison
2. **ConfigService Integration**: Use NestJS `ConfigService` instead of direct `process.env` access for testability and consistency
3. **Minimum Token Length**: Require `METRICS_TOKEN` to be at least 16 characters (enforced via class-validator)
4. **Production Enforcement**: In production, missing `METRICS_TOKEN` results in 401/404 responses to hide endpoint existence
5. **Prometheus Configuration**: Configure Prometheus to use `bearer_token_file` for secure token mounting from Kubernetes Secrets

### Implementation Details

```typescript
// MetricsGuard uses timing-safe comparison
private timingSafeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    crypto.timingSafeEqual(aBuf, aBuf); // Maintain constant time
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}
```

## Consequences

### Positive

- **Security**: Metrics are protected from unauthorized access
- **Compliance**: Follows security best practices for observability endpoints
- **Testability**: Guard-based approach enables easy unit testing
- **Kubernetes-Native**: Integration with Secrets for secure token management

### Negative

- **Operational Overhead**: Teams must manage `METRICS_TOKEN` secret rotation
- **Local Development**: Developers need to set `METRICS_TOKEN` or run in non-production mode

## Acceptance Criteria

| Criterion | Owner | Status |
|-----------|-------|--------|
| Metrics endpoint returns 401 without valid token in production | @platform-team | ✅ Complete |
| Timing-safe comparison prevents timing attacks | @security-team | ✅ Complete |
| Prometheus ConfigMap uses bearer_token_file | @devops-team | ✅ Complete |
| Unit tests cover all auth scenarios | @platform-team | ✅ Complete |
| MinLength(16) validation on METRICS_TOKEN | @platform-team | ✅ Complete |

## Related

- [ADR-0001: Record Architecture Decisions](./0001-record-architecture-decisions.md)
- [Kubernetes Prometheus ConfigMap](../../manifests/prometheus-configmap.yaml)
- [MetricsGuard Implementation](../../src/modules/metrics/guards/metrics.guard.ts)
