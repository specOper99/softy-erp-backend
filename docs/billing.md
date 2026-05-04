# Billing Consistency Model

## Chosen Approach: Idempotency-with-Compensation

### Overview

Subscription state is maintained in two places: Stripe (source of truth for payment status) and
the local `subscriptions` table (used for access control and feature gating). These can diverge
temporarily and are reconciled daily by a cron job.

### Write Path (Stripe → DB)

All state changes originate from Stripe webhooks (`BillingWebhookController`):

1. Stripe fires a webhook event (e.g. `customer.subscription.updated`).
2. The webhook is persisted in `billing_webhook_events` before processing
   (idempotency: duplicate event IDs are deduplicated by the unique index on `stripeEventId`).
3. The handler updates the local `subscriptions` row to match the Stripe status.
4. Access-control guards read from the local DB — never from Stripe at request time.

### Idempotency Keys

Outbound calls to Stripe that create subscriptions or invoices use tenant-scoped idempotency keys
(format: `sub-create-{tenantId}`) to prevent duplicate objects if a request is retried.

### Divergence Window

Between a Stripe event and its webhook delivery, local state may lag by up to Stripe's retry
window (~72 h in the worst case). Mitigations:

- **Webhook signature verification** prevents forgery; unsigned events are rejected.
- **Daily reconciliation cron** (`SubscriptionReconcileService`) compares DB status against the
  Stripe API for every active subscription and logs / increments a metric on any mismatch so the
  on-call engineer is alerted.
- **`isActive()` guard** on the entity uses the local `status` column, so a delayed webhook cannot
  silently extend access beyond what Stripe reports.

### Failure Modes

| Scenario | What happens |
|---|---|
| Webhook delivery fails | Stripe retries up to 72 h. Reconciliation cron catches mismatches. |
| Stripe outage during create | Idempotency key ensures the next attempt creates exactly one subscription. |
| DB write fails after Stripe create | Reconciliation cron detects the orphaned Stripe subscription on next run. |
| Double webhook delivery | Deduplicated by `stripeEventId` unique index. |

### Reconciliation Cron

The `SubscriptionReconcileService.reconcile()` method runs daily at 02:00 UTC (configurable via
`BILLING_RECONCILE_CRON`). It:

1. Loads all DB subscriptions that have a `stripeSubscriptionId`.
2. Fetches the current status from Stripe for each.
3. If the statuses differ, logs an error and increments the `billing.reconcile.mismatch` counter.
4. Does **not** auto-correct — corrections must be applied by an engineer after review to avoid
   unintentional access changes.

See `src/modules/billing/services/subscription-reconcile.service.ts`.

### Future Work

- Add a `last_reconciled_at` column to `subscriptions` to track when each was last verified.
- Consider auto-correcting non-destructive mismatches (e.g. `PAST_DUE → ACTIVE` when Stripe
  shows the invoice is paid) once the reconciliation has been running reliably for 30+ days.
