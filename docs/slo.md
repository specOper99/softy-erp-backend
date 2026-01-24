# Service Level Objectives (SLOs)

This document defines the SLOs for softY ERP API services.

---

## API Availability

| Metric | Target | Error Budget (30d) |
|--------|--------|-------------------|
| Successful requests (non-5xx) | **99.9%** | 43.2 minutes |

**Measurement:** `1 - (5xx_count / total_count)`

---

## API Latency

| Percentile | Target | Alert Threshold |
|------------|--------|-----------------|
| P50 | < 100ms | - |
| P95 | < 300ms | > 500ms |
| P99 | < 500ms | > 1s |

**Measurement:** `histogram_quantile(0.99, http_request_duration_seconds_bucket)`

---

## Booking Success Rate

| Metric | Target |
|--------|--------|
| Bookings confirmed without error | **99.5%** |

---

## Error Budget Policy

| Budget Consumed | Action |
|-----------------|--------|
| < 50% | Normal operations |
| 50-75% | Increase monitoring, reduce risky deployments |
| 75-100% | Feature freeze, focus on reliability |
| > 100% | Incident response, rollback recent changes |

---

## Alert Thresholds

Based on [Google SRE Multi-Window, Multi-Burn-Rate Alerts](https://sre.google/workbook/alerting-on-slos/):

| Window | Burn Rate | Severity |
|--------|-----------|----------|
| 5m | > 14x | Critical (page) |
| 30m | > 3x | Warning |
| 6h | > 1x | Ticket |

---

## Dashboard

See: `scripts/monitoring/slo-dashboard.json`
