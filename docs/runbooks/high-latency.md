# Runbook: High API Latency

**Severity**: P2 (or P1 if unavailability ensues)
**Trigger**: `p95_latency > 500ms` for 5 minutes.

## 1. Impact Assessment
- Check existing `Status Page`.
- Is it global or specific to an endpoint?
- Are users reporting failures?

## 2. Diagnosis Steps
### Database (Usually the culprit)
1. **Check CPU/Memory**: Is RDS CPU > 80%?
2. **Check Locks**: Run `SELECT * FROM pg_stat_activity WHERE wait_event_type = 'Lock';`
3. **Slow Queries**: Check Performance Insights. Look for missing indexes on recent deployments.

### Application
1. **Garbage Collection**: Check if Node.js Event Loop Lag is severe.
2. **External Dependencies**: Is stripe/sendgrid slow? Check their status pages.
3. **Traffic Spike**: Check Request Count. Is this a DDOS or viral event?

## 3. Mitigation
- **Database**: Kill long running queries `SELECT pg_terminate_backend(pid) ...`.
- **Scale**: Increase Replicas (HPA should do this, but verify max limit).
- **Circuit Breaker**: If external dependency is slow, ensure Opossum circuit breaker is OPEN to fail fast.

## 4. Resolution
- Revert recent code deployment if specialized endpoint is slow.
- Add index if missing.
