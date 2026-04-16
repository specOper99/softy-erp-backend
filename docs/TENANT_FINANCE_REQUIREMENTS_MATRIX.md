# Tenant Finance Requirements Matrix

Last revalidated: 2026-04-13

## Scope

This matrix covers tenant finance behavior that is actively used by the tenant UI or required by backend finance workflows:

- booking payment, invoice lookup, and invoice PDF download
- transactions, summaries, and budget reporting
- categories, vendors, recurring transactions, and purchase invoices
- wallets and payroll
- P&L, revenue by package, statements, and package profitability
- booking-finance and wallet/payroll invariants

## Matrix

| Flow | Actor / screen | Request contract | Response contract | Invariant / expectation | Proof |
| --- | --- | --- | --- | --- | --- |
| Booking payment + invoice lookup/download | `ADMIN`, `OPS_MANAGER` on `/[tenantId]/bookings` | `POST /bookings/{id}/payments` with payment DTO; `GET /invoices/booking/{bookingId}`; `GET /invoices/{id}/pdf` | Booking payment updates plus invoice detail / PDF blob | Recording payment must sync booking payment state; invoice lookup must be deterministic per booking; PDF download must use invoice id only after lookup | `backend/test/bookings.e2e-spec.ts`; `backend/src/modules/finance/controllers/invoice.controller.spec.ts`; `frontend/tests/finance-contracts.test.ts`; frontend usage in `frontend/src/api/bookings-api.ts` and `frontend/src/features/bookings/bookings-page.tsx` |
| Transaction list, cursor filters, and summary cards | `ADMIN` on `/[tenantId]/finance` | `GET /transactions/cursor?cursor&limit&type&startDate&endDate&bookingId`; `GET /transactions/summary`; `POST /transactions` | Cursor page of transactions and canonical summary with `totalIncome`, `totalExpenses`, `totalPayroll`, `netBalance`, `currency` | Cursor filters must support the same booking-linked workflow the UI exposes; summary totals must map to one canonical shape at the API boundary | `frontend/tests/finance-contracts.test.ts`; `backend/src/modules/finance/services/finance.service.spec.ts`; `backend/src/modules/finance/controllers/transactions.controller.spec.ts`; `backend/test/finance.e2e-spec.ts` contains a bookingId cursor regression, but full e2e execution is currently blocked in this sandbox by missing container runtime |
| Budget planning and compliance report | `ADMIN` on `/[tenantId]/finance` budget tab | `POST /transactions/budgets`; `GET /transactions/budgets?period=YYYY-MM` | Budget rows with department, budget amount, actual spent, variance, utilization | Budget report must remain tenant-scoped and compute actual spending against the selected period | `backend/src/modules/finance/services/financial-report.service.spec.ts`; frontend usage in `frontend/src/api/finance-api.ts` and `frontend/src/features/finance/finance-page.tsx` |
| Categories, vendors, and recurring transactions | `ADMIN` on `/[tenantId]/finance` | CRUD across `/finance/categories`, `/finance/vendors`, `/finance/recurring-transactions` | Tenant-scoped CRUD DTOs | CRUD must stay tenant-scoped and preserve finance reference data consistency | `backend/src/modules/finance/services/transaction-categories.service.spec.ts`; `backend/src/modules/finance/services/vendors.service.spec.ts`; `backend/src/modules/finance/services/recurring-transaction.service.spec.ts`; `backend/src/modules/finance/controllers/recurring-transaction.controller.spec.ts` |
| Purchase invoices and linked expense posting | `ADMIN` on `/[tenantId]/finance` purchase invoices tab | `POST /finance/purchase-invoices` with vendor, invoice number/date, amount, category, notes | Purchase invoice detail plus linked expense transaction | Creating a purchase invoice must also write the linked expense transaction; failure must not leave a partial money state | `backend/src/modules/finance/services/purchase-invoices.service.spec.ts`; `backend/src/modules/finance/controllers/purchase-invoices.controller.spec.ts`; vendor statement coverage in `backend/src/modules/finance/services/financial-report.service.spec.ts` |
| Wallet self-view and admin wallet access | `FIELD_STAFF` on `/[tenantId]/wallet`; `ADMIN` on wallet/finance views | `GET /wallets/me`; `GET /wallets`; `GET /wallets/cursor`; `GET /wallets/user/{userId}` | Wallet item normalized to UI fields including `balance`, `incentivesTotal`, and `expectedSalary` | Field staff may read only their own wallet; admin paths may inspect tenant wallets; UI parsing must normalize backend `pendingBalance` and `payableBalance` fields | `frontend/tests/finance-contracts.test.ts`; `backend/src/modules/finance/controllers/wallets.controller.spec.ts`; `backend/src/modules/finance/services/wallet.service.spec.ts`; `backend/test/workflows.e2e-spec.ts` |
| Payroll run + payroll history | `ADMIN` on `/[tenantId]/payroll` | `POST /hr/payroll/run` with optional `month` and `year`; `GET /hr/payroll/history`; `GET /hr/payroll/history/cursor` | Payroll run response and payroll history rows normalized to UI fields | Manual payroll runs must accept explicit period payload; history rows must normalize `totalPayout` / `processedAt` for the UI | `frontend/tests/finance-contracts.test.ts`; `backend/src/modules/hr/controllers/hr.controller.spec.ts`; `backend/src/modules/hr/services/payroll.service.spec.ts` |
| Reports: P&L, revenue by package, statements, package profitability | `ADMIN` on `/[tenantId]/reports` | `GET /finance/reports/pnl`; `GET /finance/reports/revenue-by-package`; `GET /finance/reports/statement/*`; `GET /finance/reports/profitability/packages` | Report rows carrying `income`, `expenses`, `payroll`, `net`, `totalRevenue`, `bookingCount` | Frontend adapters must parse both P&L and revenue shapes without page-local fallback logic; backend report endpoints stay admin-only | `frontend/tests/finance-contracts.test.ts`; `backend/src/modules/finance/controllers/financial-report.controller.spec.ts`; `backend/src/modules/finance/services/financial-report.service.spec.ts`; `backend/test/e2e/financial-reports.e2e-spec.ts` |
| Booking confirmation and task-completion money invariants | Booking workflow and task workflow | Booking confirm / task complete workflow service paths | Booking, task, wallet, and transaction persistence | Confirming a booking must create tasks and one income transaction atomically; task completion must move commission to wallet payable atomically; failure must roll back partial writes | `backend/docs/DOMAIN_INVARIANT_MATRIX.md`; `backend/test/integration/workflows/booking-finance-integrity.integration.spec.ts`; `backend/test/workflows.e2e-spec.ts` |

## Remaining Verified Gaps

1. Full backend finance e2e verification in this workspace still needs a reachable test database. The harness now supports `E2E_USE_EXISTING_DB=true` as a fallback when Docker/testcontainers are unavailable, but no reachable test Postgres instance was available in this sandbox.

## Acceptance Snapshot

- Finance contract normalization for booking payment/invoice helpers, transactions summary, transactions cursor, wallet parsing, payroll parsing, and report rows is implemented and covered by frontend regression tests.
- Cached OpenAPI artifacts now include `GET /api/v1/invoices/booking/{bookingId}` and frontend capability checks can see that endpoint.
- Backend bookingId filter parity on `GET /transactions/cursor` is implemented and covered by backend unit/controller tests, with e2e coverage added but not runnable in the current sandbox.
- Backend now has an explicit offline export path for OpenAPI (`npm run openapi:export`) that runs without Redis queues or database lifecycle initialization, plus explicit existing-DB fallbacks for e2e/integration harnesses.
- Tenant finance docs now separate real runtime gaps from stale historical notes.
