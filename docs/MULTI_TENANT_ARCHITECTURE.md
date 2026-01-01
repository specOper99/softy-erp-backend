# Multi-Tenant Architecture Documentation

## Overview

Chapters Studio ERP implements **tenant-based data isolation** using a defense-in-depth approach. We combine application-level context with database-level constraints to ensure zero cross-tenant data leakage.

## Data Isolation Strategy

We use a two-tiered isolation strategy:

1.  **Application Layer**: `AsyncLocalStorage` maintains the request-scoped tenant context.
2.  **Database Layer**: Composite Foreign Key constraints on `(id, tenant_id)` ensure that entities can only reference records belonging to the same tenant.

## Authentication Flow (JWT-Only)

We have removed all dependencies on client-provided tenant headers (`X-Tenant-ID`). Tenant identification is now derived strictly from the authenticated JWT payload or identified from credentials during login.

```
┌─────────────┐   1. Register     ┌─────────────┐
│   Client    │ ─────────────────▶│  /register  │
│             │                   │             │
│             │◀──────────────────│             │
│             │    JWT (w/ tenantId)            │
└─────────────┘                   └─────────────┘

┌─────────────┐   2. Login        ┌─────────────┐
│   Client    │ ─────────────────▶│   /login    │
│             │    (Email/Pass)   │             │
│             │◀──────────────────│             │
│             │    JWT (w/ tenantId)            │
└─────────────┘                   └─────────────┘

┌─────────────┐   3. API Calls    ┌─────────────┐
│   Client    │ ─────────────────▶│ /api/v1/*   │
│             │  Authorization    │             │
│             │  Bearer <JWT>     │             │
└─────────────┘                   └─────────────┘
```

## Security Infrastructure

### Database-Level Isolation (Composite FKs)

Most tenant-scoped tables use composite foreign keys. This prevents "IDOR-by-proxy" where a user might try to link a resource they own (e.g., a Task) to a resource belonging to another tenant (e.g., a Booking from another business).

**Example Constraint:**
```sql
ALTER TABLE "tasks" 
ADD CONSTRAINT "FK_task_booking_composite" 
FOREIGN KEY ("booking_id", "tenant_id") 
REFERENCES "bookings"("id", "tenant_id");
```

### Account Lockout
- **Max Attempts**: 5
- **Lockout Duration**: 30 minutes
- **Scope**: Per email per tenant

### Redaction & Sanitization
- **@PII()**: Decorator applied to DTO fields to mask sensitive data in application logs.
- **@SanitizeHtml()**: Decorator applied to user-provided text fields (bios, notes, descriptions) to prevent Stored XSS.
- **Log Masking**: Global logger automatically redacts common sensitive keys (password, token, bankAccount).

## Performance
- All tenant-scoped queries are indexed on `tenant_id`.
- Critical tables use composite indexes on `(tenant_id, status)` or `(tenant_id, created_at)` for optimized dashboard performance.

## Security Controls summary

| Control | Implementation |
|---------|----------------|
| **Auth** | JWT with short expiry + Refresh Token Rotation |
| **Audit** | Every write action is logged with `tenant_id` and `correlationId` |
| **Headers** | `Helmet` enforced security headers |
| **CORS** | Strict allow-list enforced via `CORS_ORIGINS` |
| **Validation** | Strict DTO validation with `class-validator` |
| **Encoding** | `bcrypt` (12 rounds) for local credentials |
