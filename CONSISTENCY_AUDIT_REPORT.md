# Consistency Audit Report

**Date:** 2026-02-01

## Executive Summary ✅
- The audit found critical issues in tenant isolation (query builders bypassing tenant scoping), inconsistent use of repository abstractions, and missing event publications that break cross-module business logic. Immediate fixes are required to avoid data leakage and to stabilise cross-module state changes.

---

## 🔴 Critical Architectural Flaws

1. **Query Builder Tenant Isolation Bypass** ⚠️
   - Many usages of `createQueryBuilder()` do not include `tenantId` and therefore bypass `TenantAwareRepository` protections.
   - Notable examples: `backend/src/modules/analytics/services/analytics.service.ts`, `backend/src/modules/finance/services/finance.service.ts` (export stream), `backend/src/modules/dashboard/dashboard.service.ts`.

2. **Controller-Level Repository Access** 🔓
   - Controllers directly inject raw `Repository<T>` and perform persistence/validation (bypasses service layer and centralised checks).
   - Notable: `backend/src/modules/mail/controllers/email-templates.controller.ts`, `backend/src/modules/platform/controllers/mfa.controller.ts`.

3. **Raw Repository Injection in Services** 🧩
   - Several services (17+ instances) inject `Repository<T>` instead of `TenantAwareRepository<T>`, causing inconsistent tenant enforcement (e.g., `users.service.ts`, `invoice.service.ts`).

4. **Missing Event Publication (Event-Driven Gaps)** 🔕
   - Critical state changes are not publishing events (Bookings creation, Transactions creation, Wallet balance changes, Package price updates, etc.). This causes downstream modules (Dashboard, HR, Analytics, Notifications, Webhooks) to be out-of-sync.

5. **Background Job Tenant Isolation** 🔥
   - Cron/reconciliation jobs operate across tenants without tenant-scoped isolation (e.g., `hr/payroll-reconciliation.service.ts`). This is high risk for cross-tenant processing errors and data exposure.

---

## Inconsistency Map (high-level)

- Tenant Context Retrieval
  - Mostly consistent usage of `TenantContextService.getTenantIdOrThrow()` in services, **but not in many query builders**.
- Repository Usage
  - Pattern expected: Service -> TenantAwareRepository -> DB
  - Violations: Controller -> Repository, Service -> raw Repository
- Events
  - Some services publish events (e.g., user deletion), but **many create/update paths lack events** (bookings, transactions, wallets, packages).

---

## Refactoring Priority (ranked)

1. Priority 1 — **Security & Data Isolation (Immediate)**
   - Add tenant scoping to all `createQueryBuilder()` usages or provide `createTenantScopedQueryBuilder()` in `TenantAwareRepository`.
   - Fix the `exportTransactionsStream()` and any export/report endpoints to be tenant-scoped.
   - Ensure background jobs are tenant-scoped.

2. Priority 2 — **Separation of Concerns & API Safety**
   - Move repository access into services; remove `@InjectRepository` from controllers.
   - Replace raw `Repository<T>` with `TenantAwareRepository<T>` where applicable.

3. Priority 3 — **Event-Driven Completeness**
   - Publish missing events: `BookingCreatedEvent`, `TransactionCreatedEvent`, `WalletBalanceChangedEvent`, `PackagePriceChangedEvent`, `UserCreatedEvent`, etc.
   - Implement handlers for cross-module reactions (finance reconciliation, dashboard updates, notifications, CRM/webhooks).

4. Priority 4 — **Hardening & Documentation**
   - Add integration tests that assert tenant isolation (negative tests for cross-tenant data access).
   - Add ADR and developer docs for tenant patterns and event design.

---

## Immediate Action Checklist (short-term)

1. Create `TenantAwareRepository.createTenantScopedQueryBuilder(alias: string)` and convert critical usages.
2. Audit and fix all CSV/stream exports (Finance, Analytics) to accept/require `tenantId` or use tenant context.
3. Publish `BookingCreatedEvent` and `TransactionCreatedEvent` where create paths exist; add handlers for notifications and webhooks.
4. Replace controller `Repository` usage with service calls (`EmailTemplatesController`, `MFAController`).
5. Add tenant-scoped iteration in background jobs (payroll, payouts, reconciliation).

---

## Quick Stats

- Query builder usages missing tenant filters: 25+
- Services using raw `Repository<T>`: 17
- Controllers directly accessing repositories: 2
- High-priority missing events identified: 8

---

## Notable Files (start here)
- `backend/src/common/repositories/tenant-aware.repository.ts` (extend helper)
- `backend/src/modules/analytics/services/analytics.service.ts`
- `backend/src/modules/finance/services/finance.service.ts`
- `backend/src/modules/dashboard/dashboard.service.ts`
- `backend/src/modules/bookings/services/bookings.service.ts` (publish creation event)
- `backend/src/modules/catalog/services/catalog.service.ts` (publish price-change event)

---

## Suggested Next Steps (offer)
- I can open a small PR with the `TenantAwareRepository` query-builder helper and fix 2-3 top-priority QBs for you. 🚀
- Alternatively, I can draft the event contracts (event DTOs + handler skeletons) for Booking / Transaction / Wallet and a unit test plan.

---

*End of report.*
