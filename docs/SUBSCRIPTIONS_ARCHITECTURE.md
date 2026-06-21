# Subscriptions Table Architecture

## Problem

Two incompatible schemas target the same PostgreSQL table name `subscriptions`:

| Source | Purpose | Key columns |
|--------|---------|-------------|
| [`subscription.entity.ts`](../src/modules/tenants/entities/subscription.entity.ts) | Tenant SaaS plan lifecycle (`FREE` / `PRO` / `ENTERPRISE`) | `plan`, `status`, `start_date`, `end_date`, `auto_renew` |
| [`1767800000001-AddBillingTables.ts`](../src/database/migrations/1767800000001-AddBillingTables.ts) | Stripe billing mirror | `stripe_subscription_id`, `stripe_customer_id`, `stripe_price_id`, `billing_interval`, `current_period_start`, `current_period_end` |

The billing migration creates `subscriptions` with Stripe-specific columns and enums (`TRIALING`, `INCOMPLETE`, etc.). The tenant `Subscription` entity expects a different column set and enum values (`ACTIVE`, `CANCELED`, `EXPIRED`, `PAST_DUE`).

**Do not write to the tenant `Subscription` entity until this collision is resolved.** Any `repository.save()` against the orphan entity risks 22P02 errors, silent column drift, or overwriting Stripe billing rows.

## Recommended resolution: split tables

1. **Rename tenant table** to `tenant_subscriptions` (or create fresh) with columns matching `Subscription` entity.
2. **Keep billing table** as `subscriptions` (or rename to `billing_subscriptions` for clarity).
3. **Migrate data** if any tenant-plan rows exist separately from Stripe rows (today there should be no writers).
4. **Update entity** `@Entity('tenant_subscriptions')` and register in modules/data-source.
5. **Add CI enum-sync coverage** after the split migration lands.

## Alternative: drop orphan entity

If product is Stripe-only for subscription state:

- Remove `Subscription` entity and `TenantSubscription` data-source registration.
- Drive plan/status from `tenants.subscriptionPlan` + Stripe webhooks only.
- Document in module README that billing state lives in `subscriptions` (Stripe schema).

## Current guardrails

- `Subscription` entity remains registered in [`data-source.ts`](../src/database/data-source.ts) for visibility only.
- Runtime schema and enum sync checks **exclude** the `subscriptions` table until the split-table migration lands.
- Billing integrations must use the Stripe `subscriptions` schema from `AddBillingTables`.

## Decision checklist (before implementation PR)

- [ ] Confirm whether tenant plan history needs a dedicated table vs. `tenants.subscriptionPlan` snapshot
- [ ] Choose table names (`tenant_subscriptions` + `billing_subscriptions` recommended)
- [ ] Write forward/backward migration with zero-downtime deploy order
- [ ] Update enum-sync expectations and integration tests
- [ ] Remove this doc's "do not write" warning after migration merges
