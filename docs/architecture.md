# System Architecture

## Overview
The Chapters Studio ERP is a robust NestJS application designed for high security and scalability. It follows a modular monolith approach with strict domain-driven boundaries and defense-in-depth security.

## High-Level Structure

1.  **Core / Infrastructure**:
    -   `AppModule`: Root module.
    -   **Observability**: Integrated Winston logging, OpenTelemetry tracing, and Prometheus metrics (token-protected in production via `METRICS_TOKEN`).
    -   **Security**: `Helmet` integration and strict CORS policies.

2.  **Common Layer (`src/common`)**:
    -   **Tenant Context**: AsyncLocalStorage based context management.
    -   **Guards**: `JwtAuthGuard`, `RolesGuard`, and `IpRateLimitGuard`.
    -   **Decorators**: `@PII` for log masking and `@SanitizeHtml` for XSS protection.
    -   **Resilience**: Circuit breakers for external SMTP and S3 calls.

3.  **Feature Modules (`src/modules`)**:
    -   Self-contained modules with dedicated DTOs, Controllers, Services, and Entities.
    -   Modules communicate via services or internal events.

## The Security Shield

We implement multiple layers of security to protect tenant data:

### Layer 1: Edge Security
- **Rate Limiting**: IP-based throttling at the global level.
- **Header Hardening**: `Helmet` removes `X-Powered-By` and adds CSP, HSTS, and other security headers.

### Layer 2: Authentication & Authorization
- **JWT-Only**: No client-side tenant selection. Identity and scope are sealed in the JWT.
- **Account Lockout**: Brute-force protection on the login endpoint.
- **RBAC**: Role-based access control enforced via high-level decorators.

### Layer 3: Application Logic
- **HTML Sanitization**: Automatic parsing and sanitization of user-provided content.
- **PII Masking**: Sensitive data is identified in DTOs and masked before reaching logs.
- **Pessimistic Locking**: Financial operations (wallets, transactions) use `pessimistic_write` locks to prevent race conditions.

### Layer 4: Data Persistence
- **Composite FK Constraints**: Database-level enforcement of tenant boundaries.
- **UUIDs**: All IDs are UUID v4 to prevent enumeration attacks.
- **Audit Logs**: Comprehensive tenant-scoped audit trails for all mutating operations.

## Resilience Mechanisms

- **Health Checks**: `/health/live` and `/health/ready` endpoints monitoring DB, Redis, Disk, and Memory.
- **Graceful Shutdown**: All connections (DB, Redis, S3) are drained before the process terminates.
- **Backup**: Automated PostgreSQL backups uploaded to MinIO/S3.

## Infrastructure Diagram

```mermaid
graph TD
    Client[Web/Mobile Client] --> LB[Load Balancer]
    LB --> Helmet[Helmet/CORS Filter]
    Helmet --> App[NestJS Application]
    
    subgraph Storage
        App --> PG[(PostgreSQL)]
        App --> Redis[(Redis Cache)]
        App --> MinIO[(MinIO/S3 Object Store)]
    end
    
    subgraph Management
        App --> Vault[HashiCorp Vault]
        App --> OTEL[OTEL Collector]
        OTEL --> Zipkin[Zipkin/Jaeger]
    end
```
