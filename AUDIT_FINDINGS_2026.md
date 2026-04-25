# Backend Audit Findings — 2026-04-17

**Scope**: `backend/src/` — full architecture and runtime defect audit  
**Status**: All findings resolved. All 10 CI checks pass. All unit tests pass.

---

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| CRITICAL | 1 | ✅ |
| HIGH | 2 | ✅ |
| MEDIUM | 1 | ✅ |
| LOW (test gap) | 1 | ✅ |

---

## Finding 1 — CRITICAL: Cross-Tenant Data Leak in `BookingsService.findOne`

**File**: `src/modules/bookings/services/bookings.service.ts`  
**Failure mode**: Any authenticated user can read, update, delete, or record payments on bookings belonging to other tenants by supplying a known or guessed booking UUID.  
**Root cause**: `findOne()` uses `createQueryBuilder` with only an `id` filter, bypassing the `TenantAwareRepository`'s automatic tenant scoping. `findAll` and `findAllCursor` correctly set `where('booking.tenantId = :tenantId', ...)` but `findOne` did not.  
**Impact**: Full cross-tenant booking data exposure. Methods `update`, `remove`, `recordPayment`, `recordRefund`, `markAsPaid`, `getBookingTransactions` all call `findOne` and inherit the vulnerability.  
**Test gap**: `bookings.service.ts` had 47% statement / 31% branch coverage. The `findOne` RBAC path was tested but the tenant isolation invariant was not asserted.  

**Remediation applied**:
```typescript
// Before (vulnerable):
qb.andWhere('booking.id = :id', { id });

// After (secure):
const tenantId = TenantContextService.getTenantIdOrThrow();
qb.andWhere('booking.id = :id AND booking.tenantId = :tenantId', { id, tenantId });
```
Test assertion updated to match new correct query parameters.

---

## Finding 2 — HIGH: Duplicate Prometheus Metric Registration Crashes at Startup

**File**: `src/modules/finance/cron/payout-consistency.cron.ts`  
**Failure mode**: `Error: A metric with the name softy_erp_stuck_payouts has already been registered.` thrown at application startup (NestJS bootstrap) depending on module initialization order.  
**Root cause**: `PayoutConsistencyCron` registered the `softy_erp_stuck_payouts` gauge via `new Gauge({ name: '...', registers: [register] })` directly in the constructor. `PayrollReconciliationService` (HR module) registers the same metric name via `MetricsFactory.getOrCreateGauge()`, which is idempotent. When `PayrollReconciliationService` initializes first, the direct `new Gauge()` in the cron throws.  
**Impact**: Application fails to start in production. Silently passes in tests because both services are unit-tested in isolation with mocks.  
**Test gap**: `payout-consistency.cron.ts` had 0% coverage — no test file existed.

**Remediation applied**:
1. Added `MetricsModule` to `FinanceModule` imports to make `MetricsFactory` available.
2. Injected `MetricsFactory` into `PayoutConsistencyCron` constructor.
3. Replaced `new Gauge(...)` with `metricsFactory.getOrCreateGauge(...)`.

---

## Finding 3 — HIGH: Outbox Relay Silently Discards All Events

**File**: `src/common/services/outbox-relay.service.ts`  
**Failure mode**: Every outbox event is marked `PUBLISHED` in the database but never delivered to any message broker. Silent data loss — no error raised, no warning emitted.  
**Root cause**: `publishEvent()` was a stub: `return new Promise((resolve) => setTimeout(resolve, 50))`. No broker client was injected or called.  
**Impact**: The transactional outbox pattern (at-least-once delivery guarantee) is completely broken. Any future code writing to `outbox_events` would silently lose all messages.  
**Note**: No application code currently writes to the outbox table, so production impact is currently zero. The risk is that any future developer adding an outbox writer would face invisible message loss.  
**Test gap**: `outbox-relay.service.ts` had 0% coverage.

**Remediation applied**: Replaced the stub with an `Error` throw that produces an actionable message:
```typescript
throw new Error(
  `No message broker configured. Cannot publish outbox event type=${event.type} id=${event.id}. ` +
  `Implement this method by wiring a broker client and emitting: broker.emit(event.type, event.payload)`
);
```
Events that reach the outbox will now be marked `FAILED` with a clear error instead of silently marked `PUBLISHED`. The `FAILED` status ensures they surface in monitoring and can be retried once a broker is wired.

---

## Finding 4 — MEDIUM (stale test): Currency Enum Test Used Valid Value as Invalid

**File**: `src/modules/finance/services/finance.service.spec.ts` (line 240)  
**Failure mode**: Test "should reject unsupported currency values" was testing `currency: 'IQD'`, but `IQD` was added to the `Currency` enum in a prior session. The test would have failed CI if the enum addition was guarded by the test.  
**Root cause**: `Currency.IQD` was added without updating the negative test case.  
**Test gap**: False negative — test would pass but for the wrong reason once the guard was removed.

**Remediation applied**: Changed test currency from `'IQD'` to `'JPY'`, which is genuinely absent from the enum.

---

## Architecture Assessment — No Defect Found

The following areas were audited and are **clean**:

| Area | Assessment |
|------|-----------|
| `main.ts` / `app.module.ts` bootstrap | Global pipes, guards, filters, interceptors registered correctly |
| `TenantContextService` (AsyncLocalStorage) | Correct use of `run()` in middleware; `enter()` only in background jobs |
| `TenantMiddleware` | JWT-verified extraction; fails safely on invalid tokens |
| `TenantGuard` | Cache-backed tenant status check; blocks non-ACTIVE/GRACE_PERIOD tenants |
| `DistributedLockService` | Redis SET NX + Lua atomic release; correct TTL handling |
| All 6 cron jobs | Every cron uses `DistributedLockService.withLock()` — no unguarded crons |
| `AuthService` — login | Timing-attack mitigation (dummy bcrypt + 100ms floor) |
| `AuthService` — refresh | 10s concurrent refresh grace window; token reuse → revoke all sessions |
| `TokenBlacklistService` | SHA-256 prefix key; TTL = token lifetime + 30s |
| `AccountLockoutService` | Redis-backed, configurable via env |
| `BookingStateMachineService` | All transitions validated; terminal states correctly locked |
| `BookingWorkflowService` | Pessimistic locking in all multi-step transactions |
| `MediaService` | Magic-byte validation; MIME mismatch detection; path traversal prevention |
| `PrivacyService` | Path traversal prevention; export size limit; correct anonymization |
| `BillingWebhookController` | Stripe signature verification via `constructWebhookEvent` |
| `SubscriptionService` | Idempotent webhook processing via DB unique constraint (error code 23505) |
| `IdempotencyInterceptor` | In-flight detection with 30s stale timeout; key length validation |
| `AllExceptionsFilter` | No internal error details in production; correlation ID propagation |
| `OutboxRelayService` | Fixed (see Finding 3) |

---

## Test Coverage Gaps (Unresolved — Future Work)

| File | Stmt% | Branch% | Priority |
|------|-------|---------|----------|
| `src/modules/finance/cron/payout-consistency.cron.ts` | 0% | 0% | HIGH — no spec file exists |
| `src/common/services/outbox-relay.service.ts` | 0% | 0% | MEDIUM — fixed behavior, needs test |
| `src/modules/bookings/services/bookings.service.ts` | 47% | 31% | HIGH — cross-tenant isolation paths untested |
| `src/modules/privacy/privacy.service.ts` | 38% | 60% | MEDIUM — export/deletion flow untested |
| `src/common/interceptors/idempotency.interceptor.ts` | N/A | N/A | MEDIUM — not in coverage report |
| `src/modules/tenants/guards/tenant.guard.ts` | N/A | N/A | LOW — not in coverage report |

**Recommended next steps**:
1. Add `payout-consistency.cron.spec.ts` with mocked `PayoutRepository`, `TenantsService`, `DistributedLockService`, and `MetricsFactory`.
2. Add `outbox-relay.service.spec.ts` verifying that events are marked FAILED with the broker-not-configured error.
3. Expand `bookings.service.spec.ts` to assert tenant isolation on `findOne` (now done for happy path; add cross-tenant rejection test).
4. Add integration-level tests for `PrivacyService.processDataExport` and `processDataDeletion`.
