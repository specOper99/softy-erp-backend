# Runbook: Payroll Reconciliation Failures

## Trigger
But receiving an alert with `[CRITICAL] Payout <ID> is COMPLETED at gateway but PENDING in DB!`.

## Severity
**High**. This means money has potentially left the company bank account, but the ERP system has not recorded the transaction.

## Diagnosis Steps
1. **Verify Gateway Status**: Log in to the Payment Gateway dashboard and search for the `referenceId` from the log.
   - If status is `COMPLETED`: Proceed to remediation.
   - If status is `FAILED`: The DB record should be marked as FAILED and user wallet refunded.
   - If `NOT_FOUND`: The gateway call likely never happened or failed very early.

2. **Check Database**: Query the `payouts` table for the ID.
   ```sql
   SELECT * FROM payouts WHERE id = '...';
   ```

## Remediation
**scenario A: Gateway COMPLETED, DB PENDING**
1. Manually create the missing ERP transaction.
   - Use `FinanceService.createTransaction` (via CLI or admin scripts if available).
   - Category: `PAYROLL`.
   - Notes: "Manual reconciliation for payout <ID>".
2. Update the Payout record.
   ```sql
   UPDATE payouts SET status = 'COMPLETED', notes = notes || ' Manually reconciled' WHERE id = '...';
   ```

**Scenario B: Gateway FAILED, DB PENDING**
1. Refund the user's wallet.
   - Identify `userId` and `commissionAmount` from payout `metadata`.
   - Call `WalletService.refundPayableBalance(userId, commissionAmount)`.
2. Update the Payout record.
   ```sql
   UPDATE payouts SET status = 'FAILED' WHERE id = '...';
   ```

## Prevention
If this happens frequently, investigate:
- `PayoutRelayService` crashes or timeouts.
- Database connection issues during the "Steps after gateway call" phase.

---

## Automated Reconciliation

> [!NOTE]
> As of 2026-01-17, an automated nightly reconciliation job runs at **2:00 AM** daily.
> See [ADR-0004: Automated Payroll Reconciliation](../adr/0004-automated-payroll-reconciliation.md).

The `PayrollReconciliationService`:
1. Scans all PENDING payouts older than 24 hours
2. Verifies gateway status via `checkPayoutStatus`  
3. Creates tickets automatically for mismatches

**Prometheus Alerts**:
- `PayrollReconciliationMismatch` - fires when mismatches are detected
- `ReconciliationJobFailed` - fires if the job fails

### Acceptance Criteria

| Criterion | Owner |
|-----------|-------|
| Mismatches investigated within 24 hours | @finance-team |
| Critical (PENDING_BUT_COMPLETED) resolved within 2 hours | @finance-team |
| Root cause documented in post-mortem | @platform-team |

