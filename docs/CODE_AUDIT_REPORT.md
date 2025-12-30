# Chapters Studio ERP — Ruthless Architecture, Logic, and Security Review

Date: 2025-12-30

## Executive Summary

**Overall score: 4/10**

This codebase *looks* production-oriented (NestJS 11, global validation, JWT, throttling, structured logging, Vault integration, transactions with row locks), but the multi-tenant boundary is inconsistently enforced and in some places outright absent. As a result, **cross-tenant data exposure and cross-tenant data corruption are plausible** in normal usage.

The most serious issues are not subtle: dashboard aggregates lack tenant filters, media attachments have no tenant ownership at all, and “tenant CRUD” appears unprotected. There are also dangerous defaults (hardcoded test secret, permissive CORS fallback with credentials, spoofable IP rate limiting).

## Critical Defects (Priority High)

### 1) Cross-tenant data exposure: Dashboard queries ignore tenant scoping

**Where**
- [src/modules/dashboard/dashboard.service.ts](../src/modules/dashboard/dashboard.service.ts)

**What’s wrong**
- Every dashboard query aggregates *across all tenants*. There is no `tenantId` filter in:
  - `getRevenueSummary()`
  - `getStaffPerformance()`
  - `getPackageStats()`

**Impact**
- Direct confidentiality breach: tenant A can observe tenant B revenue, staff performance, and package stats.

**Fix (code snippet)**
```ts
import { TenantContextService } from '../../common/services/tenant-context.service';

const tenantId = TenantContextService.getTenantId();
if (!tenantId) throw new Error('Tenant context missing');

queryBuilder.where('t.tenantId = :tenantId', { tenantId });
```
Apply this pattern consistently in all dashboard query builders.

---

### 2) Cross-tenant data exposure + deletion: Media attachments have no tenant ownership

**Where**
- [src/modules/media/entities/attachment.entity.ts](../src/modules/media/entities/attachment.entity.ts)
- [src/modules/media/media.service.ts](../src/modules/media/media.service.ts)
- [src/modules/media/media.controller.ts](../src/modules/media/media.controller.ts)

**What’s wrong**
- `Attachment` entity has **no `tenantId` column**, so it cannot be scoped.
- `MediaService` reads and deletes by plain ID / bookingId / taskId without tenant checks:
  - `findOne({ where: { id } })`
  - `findByBooking({ where: { bookingId } })`
  - `remove({ where: { id } })`

**Impact**
- Any authenticated user who obtains an attachment UUID (logs, email link, leak, internal copy) can retrieve/delete cross-tenant attachments.

**Fix (code snippet)**
- Add tenant ownership to attachments and filter every query:
```ts
// Attachment entity
@Column({ name: 'tenant_id' })
tenantId: string;

// MediaService
const tenantId = TenantContextService.getTenantId();
if (!tenantId) throw new Error('Tenant context missing');

return this.attachmentRepository.findOne({
  where: { id, tenantId },
});
```
Also add DB index on `tenant_id` and ensure booking/task linkage cannot cross tenants.

---

### 3) Tenant CRUD endpoints appear unprotected

**Where**
- [src/modules/tenants/tenants.controller.ts](../src/modules/tenants/tenants.controller.ts)

**What’s wrong**
- No `@UseGuards(...)`, no role checks.

**Impact**
- In the best case, these endpoints are unusable because of global tenant enforcement.
- In the worst case (depending on tenant guard behavior + tenant header spoofing), this becomes a platform takeover vector.

**Fix**
- Either remove tenant CRUD endpoints from the tenant-user API entirely, or protect them as platform-admin-only.

Example:
```ts
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN) // or PLATFORM_ADMIN
@Controller('tenants')
export class TenantsController {}
```

---

### 4) Tenant enforcement is brittle and likely breaks “public” endpoints

**Where**
- [src/common/guards/tenant.guard.ts](../src/common/guards/tenant.guard.ts)
- [src/modules/health/health.controller.ts](../src/modules/health/health.controller.ts)
- [src/modules/metrics/metrics.controller.ts](../src/modules/metrics/metrics.controller.ts)

**What’s wrong**
- TenantGuard only exempts `POST /api/v1/auth/register` via a hard-coded string check.
- Health and metrics controllers are not declared “public” in a way TenantGuard understands.

**Impact**
- Health/metrics can 401 in real deployments unless tenant context is somehow always present.
- Adding new public endpoints will repeatedly break until someone remembers to patch a string check.

**Fix (design)**
- Replace string/path allowlisting with metadata-based controls:
  - Introduce `@SkipTenant()` (or `@Public()`) decorator.
  - TenantGuard reads Reflector metadata and bypasses tenant enforcement when explicitly annotated.

---

### 5) Production footgun: hardcoded fallback secret for “test error” endpoint

**Where**
- [src/modules/health/health.controller.ts](../src/modules/health/health.controller.ts)

**What’s wrong**
- If `TEST_ERROR_KEY` is missing, it defaults to `'test-error-secret'`.

**Impact**
- Anyone who knows/guesses the default can intentionally throw errors and spam Sentry/logs.

**Fix**
- Fail closed: return 404/disabled when `TEST_ERROR_KEY` isn’t configured, and/or disable in production.

---

### 6) IP rate limiting: copy/paste bug + spoofable client IP

**Where**
- [src/common/guards/ip-rate-limit.guard.ts](../src/common/guards/ip-rate-limit.guard.ts)

**What’s wrong**
- `softLimit` assigned twice (copy/paste defect).
- Directly trusts `x-forwarded-for`.

**Impact**
- Easy to evade throttling by spoofing headers if app is not behind a trusted proxy that normalizes headers.

**Fix**
- Remove duplicate assignment.
- Only honor forwarded headers when `trust proxy` is configured and you’re behind a known proxy.

---

### 7) CORS misconfiguration risk: permissive origin with credentials

**Where**
- [src/main.ts](../src/main.ts)

**What’s wrong**
- In production, if `CORS_ORIGINS` is missing/empty, the code falls back to `origin: true` while keeping `credentials: true`.

**Impact**
- Increases risk of credentialed cross-origin requests; easy to misconfigure in production.

**Fix**
- In production, require explicit allowlist or refuse to boot.

## Architecture & Design Review

### Strengths
- Clear modular structure under `src/modules/*` and shared concerns under `src/common/*`.
- Centralized bootstrap with:
  - ValidationPipe (`whitelist`, `transform`, `forbidNonWhitelisted`) in [src/main.ts](../src/main.ts)
  - Global exception filter in [src/main.ts](../src/main.ts)
- Refresh tokens are hashed (good practice) in [src/modules/auth/auth.service.ts](../src/modules/auth/auth.service.ts)
- Audit logging exists (but see security issues below).

### Weaknesses / anti-patterns
- **Ambient tenant context** via AsyncLocalStorage ([src/common/services/tenant-context.service.ts](../src/common/services/tenant-context.service.ts)) encourages “forgetting tenant filters”.
- You already have a `TenantAwareRepository` abstraction but most services bypass it:
  - [src/common/repositories/tenant-aware.repository.ts](../src/common/repositories/tenant-aware.repository.ts)
- Global cache interceptor is a placeholder but is registered as a global interceptor:
  - [src/common/cache/cache.interceptor.ts](../src/common/cache/cache.interceptor.ts)
  - [src/app.module.ts](../src/app.module.ts)

## Detailed Logical Analysis (Selected Flows)

### Auth flow (register/login/refresh)
**Where**
- [src/modules/auth/auth.controller.ts](../src/modules/auth/auth.controller.ts)
- [src/modules/auth/auth.service.ts](../src/modules/auth/auth.service.ts)

**Good**
- Registration uses explicit transaction + unique constraint handling.
- Refresh tokens are random and stored hashed.

**Gaps**
- Tenant requirements are enforced indirectly (middleware + guard). This coupling is fragile.

### Booking confirmation workflow
**Where**
- [src/modules/bookings/bookings.service.ts](../src/modules/bookings/bookings.service.ts)

**Good**
- Uses pessimistic lock then loads relations separately.
- Generates tasks in bulk.

**Gaps**
- Unbounded `quantity` can create massive task fan-out.
- Code quality issues (duplicate comments; odd Promise usage) indicate weak review discipline.

### Task assignment + commission accounting
**Where**
- [src/modules/tasks/tasks.service.ts](../src/modules/tasks/tasks.service.ts)

**Good**
- Transaction + lock for assignment and completion.

**Major accounting gap**
- Reassignment accrues pending commission to the new user but does not clearly reverse pending commission from the old user when reassigning. This can inflate balances.

### Finance wallet tenant integrity
**Where**
- [src/modules/finance/services/finance.service.ts](../src/modules/finance/services/finance.service.ts)
- [src/modules/finance/entities/employee-wallet.entity.ts](../src/modules/finance/entities/employee-wallet.entity.ts)

**Critical flaw**
- Wallet entity enforces `user_id` unique globally, not per tenant.
- Service sometimes looks up wallet by `userId` without tenant filter and then overwrites tenantId.

**Impact**
- Cross-tenant wallet corruption.

**Fix**
- Make `(tenant_id, user_id)` unique; never overwrite tenant_id on existing rows.

## Security Findings (OWASP Top 10 Mapping)

### Broken Access Control
- Dashboard missing tenant filter: [src/modules/dashboard/dashboard.service.ts](../src/modules/dashboard/dashboard.service.ts)
- Media missing tenant ownership: [src/modules/media/entities/attachment.entity.ts](../src/modules/media/entities/attachment.entity.ts)
- Tenants endpoints unguarded: [src/modules/tenants/tenants.controller.ts](../src/modules/tenants/tenants.controller.ts)

### Security Misconfiguration
- CORS fallback with credentials: [src/main.ts](../src/main.ts)
- Test error endpoint with default secret: [src/modules/health/health.controller.ts](../src/modules/health/health.controller.ts)

### Logging & Monitoring Issues
- `console.*` used in runtime paths, bypassing Winston sanitization:
  - [src/main.ts](../src/main.ts)
  - [src/common/telemetry/tracing.ts](../src/common/telemetry/tracing.ts)
  - [src/common/interceptors/audit.interceptor.ts](../src/common/interceptors/audit.interceptor.ts)

### File Upload / Storage risks
- Storage keys use `Math.random()` (not cryptographically strong) in [src/modules/media/storage.service.ts](../src/modules/media/storage.service.ts)
- MIME whitelist exists (good).

## Performance & Scalability

- Heavy relation graphs loaded in bookings `findOne()` may become a hot path under scale.
- Global caching is currently non-functional (interceptor stub), so claims about caching may be misleading.
- Metrics endpoint is unauthenticated and can leak operational data / be a DDoS target: [src/modules/metrics/metrics.controller.ts](../src/modules/metrics/metrics.controller.ts)

## Refactoring Recommendations (Concrete)

1) **Enforce tenant isolation centrally**
- Make tenant filtering impossible to forget:
  - adopt `TenantAwareRepository` for all tenant-scoped entities
  - or wrap repository access behind a service that always injects tenantId

2) **Add tenantId to every tenant-scoped entity**
- Attachments currently lack tenant_id.

3) **Replace hardcoded route allowlisting in TenantGuard**
- Implement `@SkipTenant()` decorator; annotate health/metrics/auth endpoints.

4) **Fix wallet uniqueness + integrity**
- Change unique constraint to `(tenant_id, user_id)`.
- Remove code that mutates tenantId on existing wallets.

5) **Harden production config**
- Fail closed on missing `CORS_ORIGINS` in production.
- Disable test-error endpoint unless configured.

## Notes / Review Limits

This report is based on direct static analysis of the current workspace. The most severe issues identified are structural (tenant isolation and access control) and do not require runtime confirmation to be valid concerns.
