# 4. Automated Payroll Reconciliation

Date: 2026-01-17

## Status

Accepted

## Context

The payroll system creates `Payout` records in PENDING status and a separate relay service processes them via an external payment gateway. A critical failure mode exists: if the gateway successfully processes a payment but the database update fails, money leaves the company account without a corresponding ERP ledger entry.

Previously, this was a manual process requiring operators to:
1. Monitor logs for `[CRITICAL] Payout is COMPLETED at gateway but PENDING in DB` messages
2. Follow the payroll-reconciliation runbook manually
3. Create tickets and track remediation

This approach is error-prone and relies on humans monitoring logs continuously.

## Decision

We will implement an **Automated Nightly Payroll Reconciliation Job** that:

1. **Runs at 2:00 AM daily** via NestJS `@Cron`
2. **Uses distributed locking** (PostgreSQL advisory lock) to prevent concurrent runs
3. **Queries stale payouts** (PENDING status older than 24 hours)
4. **Verifies gateway status** for each stale payout
5. **Creates tickets automatically** for mismatches via webhook integration
6. **Emits OpenTelemetry traces** for full observability
7. **Exposes Prometheus metrics** for alerting:
   - `chapters_payroll_reconciliation_runs_total{status}`
   - `chapters_payroll_reconciliation_mismatches_total{mismatch_type}`
   - `chapters_payroll_reconciliation_failures_total`
   - `chapters_erp_stuck_payouts` (gauge)

### Mismatch Types

| Type | Severity | Description |
|------|----------|-------------|
| `PENDING_BUT_COMPLETED` | Critical | Money left but ledger not updated |
| `PENDING_BUT_FAILED` | High | Payment failed but status not synced |

### Ticketing Integration

Uses a webhook-based abstraction (`TicketingService`) configured via `TICKETING_WEBHOOK_URL`. Structured payloads include:
- Title with mismatch type
- Remediation steps
- Links to runbook
- Metadata for traceability

## Consequences

### Positive

- **Proactive Detection**: Issues found within 24-48 hours instead of weeks
- **Automated Ticketing**: Reduces human error and ensures accountability
- **Observability**: Full tracing and metrics for SRE dashboards
- **Auditable**: All reconciliation runs logged with tenant context

### Negative

- **False Positives**: Gateway "PENDING" might not indicate a problem
- **Latency**: 24-hour delay before detection (by design for stability)
- **Dependency**: Requires payment gateway status API to be available

## Acceptance Criteria

| Criterion | Owner | Status |
|-----------|-------|--------|
| Reconciliation job runs nightly at 2:00 AM | @platform-team | ✅ Complete |
| Advisory lock prevents concurrent execution | @platform-team | ✅ Complete |
| PENDING_BUT_COMPLETED creates CRITICAL ticket | @finance-team | ✅ Complete |
| OpenTelemetry spans cover full reconciliation | @observability-team | ✅ Complete |
| Prometheus metrics exposed for alerting | @sre-team | ✅ Complete |
| Unit tests cover mismatch detection | @platform-team | ✅ Complete |
| Runbook updated with automation reference | @platform-team | ⏳ Pending |

## Related

- [ADR-0002: Transactional Outbox](./0002-transactional-outbox.md)
- [Payroll Reconciliation Runbook](../runbooks/payroll-reconciliation.md)
- [PayrollReconciliationService](../../src/modules/hr/services/payroll-reconciliation.service.ts)
