# Production Alerting Runbook

This document outlines the standard operating procedures (SOPs) for responding to production alerts triggered by Prometheus.

## 🚨 Critical Alerts

### PayrollProcessingStuck
**Description**: Detected payouts stranded in `PENDING` state for more than 10 minutes.
**Impact**: High. Potential financial discrepancy (Money left vs Ledger missing).
**Response**:
1. Check logs for reference IDs.
2. Follow the [Payroll Reconciliation Runbook](./payroll-reconciliation.md).

### HighErrorRate
**Description**: HTTP 5xx error rate > 5% for 2 minutes.
**Impact**: High. System stability compromised.
**Response**:
1. Check Grafana "Overview" dashboard.
2. Inspect logs in Loki/CloudWatch for recent exceptions.
3. Check database health (connections, CPU).
4. If database is locked, check for long-running transactions.

## ⚠️ Warning Alerts

### HighLatency
**Description**: P95 Latency > 2s.
**Impact**: Medium. Poor user experience.
**Response**:
1. Identify slow endpoints via tracing (Jaeger/Zipkin).
2. Check for N+1 queries or unoptimized loops.
3. Verify if a background job is hogging CPU.

### WebhookDeliveryFailure
**Description**: High rate of failed webhook deliveries.
**Impact**: Medium. External integrations (Slack, Stripe) might be out of sync.
**Response**:
1. Verify external service status (e.g., is Slack down?).
2. Check network connectivity from the container.
