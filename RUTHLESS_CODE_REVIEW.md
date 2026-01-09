# Ruthless Code Review (Architecture • Logic • Security • Performance • Maintainability)

Date: 2026-01-09 (post-fix re-audit)

## Executive Summary

**Score: 7.8 / 10**

The previously high-risk security findings (webhook SSRF bypass, HR attendance authorization gap, CSRF production foot-gun, numeric/decimal runtime type mismatch) are **addressed in the current codebase**.

What remains is mostly “production-hardening” work: keeping rate-limiting semantics consistent, ensuring stable response shapes for JSON-config tables, and tightening a few correctness edges.

Current repo health checks:
- Type-check and circular dependency checks are clean.
- `npm run validate` is passing (lint + tests + typecheck), based on the latest run in this workspace.

---

## Fixed Since Prior Report (Verified in Code)

### 1) Webhook SSRF defenses now fail closed + block redirects

**Where**
- src/modules/webhooks/webhooks.service.ts

**Now**
- DNS lookups fail closed (delivery is blocked on resolution errors)
- Delivery re-resolves hostname and verifies it stays within the allowlisted IP set (DNS rebinding resistance)
- Redirects are blocked by using manual redirect handling
- Queue delivery path reloads the full webhook entity so `resolvedIps` is actually enforced

### 2) HR Attendance authorization is enforced for FIELD_STAFF

**Where**
- src/modules/hr/controllers/attendance.controller.ts

**Now**
- FIELD_STAFF actions are constrained to the authenticated user (create/read/list ownership checks)

### 3) CSRF middleware enforces strong secret in production

**Where**
- src/common/middleware/csrf.middleware.ts

**Now**
- Production throws on missing/short/default `CSRF_SECRET` when CSRF is enabled

### 4) Decimal-to-number mismatch fixed via transformer

**Where**
- src/modules/hr/entities/attendance.entity.ts

**Now**
- `workedHours` uses a transformer to parse `decimal` strings into numbers safely

---

## Remaining Findings (Prioritized)

### P1 (Security/Correctness): Rate-limiting annotations were misleading for Metrics

**Where**
- src/common/guards/ip-rate-limit.guard.ts
- src/modules/metrics/metrics.controller.ts

**Issue**
- `@SkipThrottle()` only affects Nest Throttler. The global custom `IpRateLimitGuard` still rate-limited `GET /metrics`.
- This is a correctness/operational issue: it can break Prometheus scraping under load and the comment was factually wrong.

**Status (fixed in this workspace)**
- Added `@SkipIpRateLimit()` and taught `IpRateLimitGuard` to respect it.

### P2 (Correctness): Dashboard preferences can return unstable JSON shape

**Where**
- src/modules/dashboard/dashboard.service.ts
- src/modules/dashboard/entities/user-preference.entity.ts

**Issue**
- The `dashboardConfig` column default is `{}`. If legacy rows exist with `{}`, callers can receive a config without `widgets`, even though the API contract implies `widgets: []`.

**Status (fixed in this workspace)**
- `getUserPreferences()` now normalizes the shape and always returns `{ widgets: [] }` when missing/invalid.

---

## Tenant Isolation Sweep (Spot-Checked)

- Most tenant-scoped queries correctly include `tenantId` in `where` clauses or query builder filters.
- Remaining `findOne({ where: { id: tenantId } })` instances are against the Tenant entity itself (global), which is expected.

---

## Suggested Follow-ups (Not blockers)

- Consider consolidating to a single rate-limiting system (Throttler vs custom IP limiter), or ensure every “skip” annotation has an equivalent for both.
- Consider migrating `user_preferences.dashboard_config` default to include `{"widgets":[]}` at the DB level (optional; the runtime normalization already prevents API contract drift).

  if (attendance.checkOut < attendance.checkIn) {
    throw new BadRequestException('checkOut must be after checkIn');
  }
  attendance.calculateWorkedHours();
}
```

2) `UpdateAttendanceDto` allows client-supplied `workedHours`
- This enables tampering unless the endpoint is strictly privileged.

**Recommendation:** remove `workedHours` from DTO and compute server-side only.

3) Date handling can go off-by-one due to timezone
- `@IsDateString()` allows `YYYY-MM-DD`, which becomes a Date in UTC but can shift when stored/serialized.

**Recommendation:** store `date` as a `string` (YYYY-MM-DD) or normalize to UTC midnight explicitly.

---

### Auth Flow

**Issues**

1) `logoutAllSessions()` returns `0` regardless of real work
- This looks like a stub left behind and breaks any caller that expects a count.

**Corrected snippet**

```ts
async logoutAllSessions(userId: string): Promise<number> {
  return this.tokenService.revokeAllUserTokens(userId);
}
```

2) Tenant/email uniqueness policy is implicit
- `register()` checks `UsersService.findByEmail()` without tenant scoping.
- If multi-tenant should allow the same email across tenants, this is a functional defect.

**Recommendation:** make this a deliberate, documented invariant (and enforce via DB unique constraints accordingly).

---

## Performance & Scalability Findings

### Hot-path risks

- Unbounded list endpoints returning `find()` results without pagination (e.g., HR attendance `findAll`). This will degrade linearly with tenant size and can amplify memory usage.

**Recommendation:** apply cursor pagination consistently; the repo already mentions a cursor pagination helper — enforce it for all list endpoints.

### Outbound webhook delivery

- Inline fallback does `Promise.allSettled(deliveries)` for all webhooks; if a tenant registers a large number of endpoints, this becomes a resource spike.

**Recommendation:** force queue-only delivery in production; treat inline delivery as dev/test-only.

---

## Code Quality & Maintainability

### Concrete defects

- `Attendance.notes` is declared as `string` but the DB column is nullable.
  - Fix by making it `string | null`.

### General maintainability warnings

- Multiple global cross-cutting features (tenant, CSRF, throttling, logging, serialization) are configured in multiple places. This increases “action at a distance”.
- Security toggles that are safe in isolation become unsafe when combined (example: CSRF enabled by default + default secret).

---

## Recommended Next Actions (Highest ROI)

1) Fix webhook SSRF properly (DNS rebinding + redirects) **before shipping**.
2) Fix HR Attendance authorization for FIELD_STAFF (ownership checks).
3) Fix `decimal` transformers across all entities using numeric types.
4) Enforce CSRF secret (or disable CSRF entirely for JWT-only API usage).
5) Add pagination to all list endpoints.
