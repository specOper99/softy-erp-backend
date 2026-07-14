# Event Contract (Bookings / Finance / Tasks)

## Durable delivery (Architecture Cleanup Phase 2)

PostgreSQL transactional outbox → BullMQ relay is the target for categorized durable events. Envelope fields: `eventId`, `eventType`, `eventVersion`, `tenantId`, `aggregateType`, `aggregateId`, `occurredAt`, `payload`, optional `correlationId`. Consumer inbox dedupe: `(consumerName, eventId)`.

Category membership is defined in `src/common/events/outbox-envelope.ts` (source of truth for kill-switch routing). **As of 2026-07-10:**

| Category | Kill switch | Event types in envelope set |
|----------|-------------|-------------------------------|
| financial | `durable-financial-outbox-events` | `PaymentRecordedEvent`, `RefundRecordedEvent` |
| notification | `durable-notification-outbox-events` | `BookingCreatedEvent`, `BookingCompletedEvent`, `TaskAssignedEvent`, `TaskCompletedEvent` |
| mail | `durable-mail-outbox-events` | `BookingConfirmedEvent`, `BookingCancelledEvent`, `BookingRescheduledEvent`, `PaymentRecordedEvent`, `TaskAssignedEvent` |
| webhook | `durable-webhook-outbox-events` | `BookingCreatedEvent`, `BookingConfirmedEvent`, `BookingUpdatedEvent`, `BookingCompletedEvent`, `TaskCompletedEvent`, `PackagePriceChangedEvent`, `ClientCreatedEvent`, `ClientUpdatedEvent`, `ClientDeletedEvent` |

Ops matrix (producers / consumers / inbox names): `docs/ops/OUTBOX_OPERATIONS.md` (repo root).

Legacy in-process CQRS remains for event types not yet migrated, and when a category kill switch is **OFF**. CQRS notification/mail/webhook/financial handlers skip when their durable flag is ON (no dual delivery).

DLQ replay: `npm run outbox:dlq-replay -- --dry-run` (see `scripts/outbox-dlq-replay.ts`). Kill-switch FAILED rows: `npm run outbox:dlq-replay -- --reason kill-switch`.

### Gap-plan A–B durable types (landed 2026-07-10)

| Type | Envelope? | Status |
|------|-----------|--------|
| `RefundRecordedEvent` | Yes (financial) | Event class + outbox producer in `recordRefund`; metrics via `OutboxFinancialConsumer` |
| `BookingCompletedEvent` | Yes (notification + webhook) | Outbox producer + CQRS notification/webhook handlers (skip when durable ON) |
| `ClientCreatedEvent` / `ClientUpdatedEvent` / `ClientDeletedEvent` | Yes (webhook) | Outbox producers + CQRS webhook handlers |
| `PackagePriceChangedEvent` webhook | Yes (webhook) | CQRS webhook handler emits; catalog cache handler unchanged |
| Financial consumer | — | Real `OutboxFinancialConsumer` (`outbox-financial-consumer`); no inbox-only stub |

---

This repo uses in-process NestJS CQRS domain events (`@nestjs/cqrs`) for cross-module reactions (dashboards, mail, webhooks, analytics, finance cache invalidation).

This document lists only the events that exist in code and the producers/consumers that are present in this repo.

This doc is the source of truth for event topology, and CI verifies it via `scripts/ci/check-event-contract.ts` (run `npm run check:event-contract`).

**CI note:** `Consumed by` entries must be CQRS `@EventsHandler(...)` files. Durable BullMQ consumers (`OutboxMailConsumer`, etc.) are documented in OUTBOX_OPERATIONS / the durable table above — do not list them under `Consumed by` unless they also use `@EventsHandler`.

## Delivery Semantics (What Is Actually Guaranteed)

### Durable path (outbox → BullMQ)

For event types behind the kill switches above (financial / notification / mail / webhook categories listed in `docs/ops/OUTBOX_OPERATIONS.md`):

- Transport: PostgreSQL `outbox_events` written in the same transaction as the aggregate, relayed to BullMQ, consumed with `consumer_inbox` dedupe.
- Durability: yes for enqueue after commit; crash-before-dispatch leaves recoverable `PENDING` rows.
- Exactly-once for DB side effects via inbox; SMTP/webhooks remain at-least-once.
- Financial category: `OutboxFinancialConsumer` applies payment/refund revenue metrics (CQRS `update-metrics` skips when durable financial ON).

### Legacy CQRS path (in-process)

For listeners not yet on the durable path (and when a category kill switch is **OFF**):

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
  - `src/modules/bookings/application/bookings.service.spec.ts`
  - `src/modules/bookings/application/booking-workflow.service.spec.ts`
  - `src/modules/tasks/application/tasks.service.spec.ts`
  - `src/modules/finance/application/finance.service.spec.ts`

## Canonical Domain Events (Present + Published)

Each entry lists the exact class name, publisher(s), and consumer(s) present in this repo.

### Bookings

`BookingCreatedEvent`

- Published by:
  - `src/modules/bookings/application/bookings.service.ts` (`create()`)
  - `src/modules/bookings/application/booking-intake.service.ts` (intake create; also outbox `type: 'BookingCreatedEvent'`)
  - `src/modules/bookings/application/booking-workflow.service.ts` (`duplicateBooking()`)
- Consumed by:
  - `src/modules/dashboard/infrastructure/booking-created.handler.ts`
  - `src/modules/notifications/application/booking-created.handler.ts`
  - `src/modules/webhooks/application/booking-created.handler.ts`

`BookingConfirmedEvent`

- Published by:
  - `src/modules/bookings/application/booking-workflow.service.ts` (`confirmBooking()` — outbox + publish after the transaction callback)
- Consumed by:
  - `src/modules/analytics/infrastructure/update-metrics.handler.ts`
  - `src/modules/mail/infrastructure/booking-confirmed.handler.ts`
  - `src/modules/webhooks/application/booking-confirmed.handler.ts`

`BookingCancelledEvent`

- Published by:
  - `src/modules/bookings/application/booking-workflow.service.ts` (`cancelBooking()` — outbox + publish after the transaction callback)
- Consumed by:
  - `src/modules/analytics/infrastructure/update-metrics.handler.ts`
  - `src/modules/mail/infrastructure/booking-cancelled.handler.ts`

`BookingRescheduledEvent`

- Published by:
  - `src/modules/bookings/application/booking-workflow.service.ts` (`rescheduleBooking()` — outbox + publish after the transaction callback)
- Consumed by:
  - `src/modules/mail/infrastructure/booking-rescheduled.handler.ts`

`BookingCompletedEvent`

- Published by:
  - `src/modules/bookings/application/booking-workflow.service.ts` (`completeBooking()` — outbox + publish after the transaction callback)
- Consumed by:
  - `src/modules/notifications/application/booking-completed.handler.ts`
  - `src/modules/webhooks/application/booking-completed.handler.ts`

`BookingUpdatedEvent`

- Published by:
  - `src/modules/bookings/application/bookings.service.ts` (`update()` publishes after `DataSource.transaction(...)` completes)
- Consumed by:
  - `src/modules/finance/infrastructure/booking-updated.handler.ts` (invalidates financial report caches)
  - `src/modules/webhooks/application/booking-updated.handler.ts`

`BookingPriceChangedEvent`

- Published by:
  - `src/modules/bookings/application/bookings.service.ts` (`update()` publishes after `DataSource.transaction(...)` completes)
- Consumed by:
  - `src/modules/finance/infrastructure/booking-price-changed.handler.ts` (creates adjustment transaction; publishes `FinancialReconciliationFailedEvent` on failure)

`PaymentRecordedEvent`

- Published by:
  - `src/modules/bookings/application/bookings-payments.service.ts` (`recordPayment()` enqueues via transactional outbox)
  - `src/modules/bookings/application/booking-intake.service.ts` (deposit path — outbox + CQRS publish)
- Consumed by:
  - `src/modules/analytics/infrastructure/update-metrics.handler.ts`
  - `src/modules/mail/infrastructure/payment-received.handler.ts`

`RefundRecordedEvent`

- Published by:
  - `src/modules/bookings/application/bookings-payments.service.ts` (`recordRefund()` — transactional outbox only; no CQRS publish)
- Consumed by:
  - _(none CQRS — durable metrics via `OutboxFinancialConsumer`; see OUTBOX_OPERATIONS)_

### Clients

`ClientCreatedEvent`

- Published by:
  - `src/modules/clients/application/clients.service.ts` (`create()` — outbox + CQRS publish)
  - `src/modules/bookings/application/booking-intake.service.ts` (inline client create during intake — outbox + CQRS publish)
- Consumed by:
  - `src/modules/webhooks/application/client-created.handler.ts`

`ClientUpdatedEvent`

- Published by:
  - `src/modules/clients/application/clients.service.ts` (`update()` — outbox + CQRS publish)
- Consumed by:
  - `src/modules/webhooks/application/client-updated.handler.ts`

`ClientDeletedEvent`

- Published by:
  - `src/modules/clients/application/clients.service.ts` (`softRemove` delete path — outbox + CQRS publish)
- Consumed by:
  - `src/modules/webhooks/application/client-deleted.handler.ts`

### Catalog

`PackagePriceChangedEvent`

- Published by:
  - `src/modules/catalog/application/catalog.service.ts` (package price update — outbox + CQRS publish)
- Consumed by:
  - `src/modules/catalog/infrastructure/package-price-changed.handler.ts` (catalog / availability cache invalidation)
  - `src/modules/webhooks/application/package-price-changed.handler.ts` (webhook emit; skips when durable webhook ON)

### Tasks

`TaskAssignedEvent`

- Published by:
  - `src/modules/tasks/application/task-assignee.service.ts` (`assignTask()` publishes after `TenantScopedManager.run(...)` completes)
- Consumed by:
  - `src/modules/mail/infrastructure/task-assigned.handler.ts`

`TaskCompletedEvent`

- Published by:
  - `src/modules/tasks/application/tasks.service.ts` (`completeTask()` publishes after `TenantScopedManager.run(...)` completes)
- Consumed by:
  - `src/modules/analytics/infrastructure/update-metrics.handler.ts`
  - `src/modules/webhooks/application/task-completed.handler.ts`

### Finance

`TransactionCreatedEvent`

- Published by:
  - `src/modules/finance/application/finance.service.ts` (`publishTransactionCreatedEvent()` used by `createTransaction()` and `createTransactionWithManager()`)
- Consumed by:
  - `src/modules/dashboard/infrastructure/transaction-created.handler.ts`

`WalletBalanceUpdatedEvent`

- Published by:
  - `src/modules/finance/application/wallet.service.ts` (`addPendingCommission()`, `subtractPendingCommission()`, `moveToPayable()`, `resetPayableBalance()`)
- Consumed by:
  - `src/modules/dashboard/infrastructure/wallet-balance-updated.handler.ts`
  - `src/modules/hr/infrastructure/wallet-balance-updated.handler.ts` (invalidates payroll/wallet cache keys)

`FinancialReconciliationFailedEvent`

- Published by:
  - `src/modules/finance/infrastructure/booking-price-changed.handler.ts` (on reconciliation failure)
- Consumed by:
  - `src/modules/finance/infrastructure/financial-failure.handler.ts` (`ReconciliationFailedHandler`)

## Events Present But Not Published (No In-Repo Producer Found)

These classes exist, but a code search in this repo does not find a corresponding `eventBus.publish(new ...)` site.

- `PayoutFailedEvent`, `BatchPayoutFailedEvent` (`src/modules/finance/events/payout-failed.event.ts`)
  - Consumers exist: `src/modules/finance/infrastructure/financial-failure.handler.ts`
  - No in-repo publisher found.
- `TransactionFailedEvent` (`src/modules/finance/events/transaction-failed.event.ts`)
  - Consumer exists: `src/modules/finance/infrastructure/financial-failure.handler.ts`
  - No in-repo publisher found.

## Consumer Expectations (What Handlers Actually Do)

- Many handlers perform side effects (emails, notifications, metric increments, websocket broadcasts). There is no repo-wide deduplication layer for CQRS events.
- Consumers that touch tenant-scoped persistence typically establish explicit tenant context with `TenantContextService.run(event.tenantId, ...)` (example: `src/modules/analytics/infrastructure/update-metrics.handler.ts`). This is also what tenant async-boundary checks enforce for handlers that touch tenant-owned persistence.

## How To Add A New Event Safely (Repo Pattern)

- Create an event class that implements `IEvent` under the owning module’s `events/` directory, and include `tenantId` in the constructor if the event is tenant-scoped.
- Publish via `EventBus.publish(...)` in the producer service.
- If the event is durable-category, also write `OutboxEvent` in the **same** transaction as the aggregate (`type` matching the class name), and add the type to the correct set in `outbox-envelope.ts`.
- If the producer writes inside `DataSource.transaction(...)`, publish after the transaction callback returns (or document why you cannot).
- In handlers that access tenant-scoped persistence, wrap work in `TenantContextService.run(event.tenantId, ...)`.
- Add/extend tests to assert `eventBus.publish(...)` / outbox `type:` is called for the producer.
- Update this doc and run `npm run check:event-contract` from `backend/`.
