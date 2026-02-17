# Event Contract (Bookings / Finance / Tasks)

This repo uses in-process NestJS CQRS domain events (`@nestjs/cqrs`) for cross-module reactions (dashboards, mail, webhooks, analytics, finance cache invalidation).

This document lists only the events that exist in code and the producers/consumers that are present in this repo.

## Delivery Semantics (What Is Actually Guaranteed)

- Transport: `EventBus.publish(...)` from `@nestjs/cqrs` (in-process).
- Durability: none. If the process crashes, events are not recovered.
- Ordering: not guaranteed across different producers/transactions.
- Exactly-once: not provided.

Notes on “publish-after-commit”:

- Several workflows intentionally publish _after_ a `DataSource.transaction(...)` callback returns (e.g. booking confirm/cancel, booking update, task assign/complete).
- This is a pattern, not a universal guarantee in the current codebase. Example: `WalletService` publishes `WalletBalanceUpdatedEvent` inside transaction-scoped methods (before the outer transaction commits).

Notes on “idempotent handlers”:

- There is no repo-wide idempotency/deduplication mechanism for CQRS event handlers.
- Many current handlers are _not_ idempotent (e.g. sending emails, creating notifications, incrementing counters/metrics, emitting webhooks). A re-run would typically repeat the side effect.
- Some event classes expose helper keys (e.g. `FinancialReconciliationFailedEvent.deduplicationKey`, `BaseFinancialEvent.metadata`) but handlers in this repo do not use them for dedupe.

Tests:

- Unit tests assert that producers publish events (not that publication is durable or post-commit):
  - `src/modules/bookings/services/bookings.service.spec.ts`
  - `src/modules/bookings/services/booking-workflow.service.spec.ts`
  - `src/modules/tasks/services/tasks.service.spec.ts`
  - `src/modules/finance/services/finance.service.spec.ts`

## Canonical Domain Events (Present + Published)

Each entry lists the exact class name, publisher(s), and consumer(s) present in this repo.

### Bookings

`BookingCreatedEvent`

- Published by:
  - `src/modules/bookings/services/bookings.service.ts` (`create()`)
  - `src/modules/bookings/services/booking-workflow.service.ts` (`duplicateBooking()`)
- Consumed by:
  - `src/modules/dashboard/handlers/booking-created.handler.ts`
  - `src/modules/notifications/handlers/booking-created.handler.ts`
  - `src/modules/webhooks/handlers/booking-created.handler.ts`

`BookingConfirmedEvent`

- Published by:
  - `src/modules/bookings/services/booking-workflow.service.ts` (`confirmBooking()` publishes after the transaction callback)
- Consumed by:
  - `src/modules/analytics/handlers/update-metrics.handler.ts`
  - `src/modules/mail/handlers/booking-confirmed.handler.ts`
  - `src/modules/webhooks/handlers/booking-confirmed.handler.ts`

`BookingCancelledEvent`

- Published by:
  - `src/modules/bookings/services/booking-workflow.service.ts` (`cancelBooking()` publishes after the transaction callback)
- Consumed by:
  - `src/modules/analytics/handlers/update-metrics.handler.ts`
  - `src/modules/mail/handlers/booking-cancelled.handler.ts`

`BookingUpdatedEvent`

- Published by:
  - `src/modules/bookings/services/bookings.service.ts` (`update()` publishes after `DataSource.transaction(...)` completes)
- Consumed by:
  - `src/modules/finance/events/handlers/booking-updated.handler.ts` (invalidates financial report caches)
  - `src/modules/webhooks/handlers/booking-updated.handler.ts`

`PaymentRecordedEvent`

- Published by:
  - `src/modules/bookings/services/bookings.service.ts` (`recordPayment()`)
- Consumed by:
  - `src/modules/analytics/handlers/update-metrics.handler.ts`
  - `src/modules/mail/handlers/payment-received.handler.ts`

### Tasks

`TaskAssignedEvent`

- Published by:
  - `src/modules/tasks/services/tasks.service.ts` (`assignTask()` publishes after `TenantScopedManager.run(...)` completes)
- Consumed by:
  - `src/modules/mail/handlers/task-assigned.handler.ts`

`TaskCompletedEvent`

- Published by:
  - `src/modules/tasks/services/tasks.service.ts` (`completeTask()` publishes after `TenantScopedManager.run(...)` completes)
- Consumed by:
  - `src/modules/analytics/handlers/update-metrics.handler.ts`
  - `src/modules/webhooks/handlers/task-completed.handler.ts`

### Finance

`TransactionCreatedEvent`

- Published by:
  - `src/modules/finance/services/finance.service.ts` (`publishTransactionCreatedEvent()` used by `createTransaction()` and `createTransactionWithManager()`)
- Consumed by:
  - `src/modules/dashboard/handlers/transaction-created.handler.ts`

`WalletBalanceUpdatedEvent`

- Published by:
  - `src/modules/finance/services/wallet.service.ts` (`addPendingCommission()`, `subtractPendingCommission()`, `moveToPayable()`, `resetPayableBalance()`)
- Consumed by:
  - `src/modules/dashboard/handlers/wallet-balance-updated.handler.ts`
  - `src/modules/hr/handlers/wallet-balance-updated.handler.ts`

`FinancialReconciliationFailedEvent`

- Published by:
  - `src/modules/finance/handlers/booking-price-changed.handler.ts` (on reconciliation failure)
- Consumed by:
  - `src/modules/finance/events/handlers/financial-failure.handler.ts` (`ReconciliationFailedHandler`)

## Events Present But Not Published (No In-Repo Producer Found)

These classes exist, but a code search in this repo does not find a corresponding `eventBus.publish(new ...)` site.

- `BookingPriceChangedEvent` (`src/modules/bookings/events/booking-price-changed.event.ts`)
  - Consumer exists: `src/modules/finance/handlers/booking-price-changed.handler.ts`
  - No in-repo publisher found.
- `PayoutFailedEvent`, `BatchPayoutFailedEvent` (`src/modules/finance/events/payout-failed.event.ts`)
  - Consumers exist: `src/modules/finance/events/handlers/financial-failure.handler.ts`
  - No in-repo publisher found.
- `TransactionFailedEvent` (`src/modules/finance/events/transaction-failed.event.ts`)
  - Consumer exists: `src/modules/finance/events/handlers/financial-failure.handler.ts`
  - No in-repo publisher found.

## Consumer Expectations (What Handlers Actually Do)

- Many handlers perform side effects (emails, notifications, metric increments, websocket broadcasts). There is no repo-wide deduplication layer for CQRS events.
- Consumers that touch tenant-scoped persistence typically establish explicit tenant context with `TenantContextService.run(event.tenantId, ...)` (example: `src/modules/analytics/handlers/update-metrics.handler.ts`). This is also what tenant async-boundary checks enforce for handlers that touch tenant-owned persistence.

## How To Add A New Event Safely (Repo Pattern)

- Create an event class that implements `IEvent` under the owning module’s `events/` directory, and include `tenantId` in the constructor if the event is tenant-scoped.
- Publish via `EventBus.publish(...)` in the producer service.
- If the producer writes inside `DataSource.transaction(...)`, publish after the transaction callback returns (or document why you cannot).
- In handlers that access tenant-scoped persistence, wrap work in `TenantContextService.run(event.tenantId, ...)`.
- Add/extend tests to assert `eventBus.publish(...)` is called for the producer.
