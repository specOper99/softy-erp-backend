# Runbook: Tenant Isolation Breach

**Severity:** P1 (Critical)  
**On-Call:** Backend Engineering  
**Escalation:** Security Team, CTO  

## Overview

A tenant isolation breach occurs when:
- User from Tenant A can access data belonging to Tenant B
- Data from multiple tenants is returned in a single response
- Cross-tenant modifications are possible
- Background jobs process data without proper tenant context

This is a **critical security incident** requiring immediate response.

## Detection

### Alerts
- `[TENANT_SECURITY] ACCESS_DENIED` in logs (attempted cross-tenant access blocked)
- `[TENANT_SECURITY] MISMATCH_DETECTED` in logs (tenant mismatch in entity)
- `TenantMismatchException` errors in Sentry/error tracking
- User reports seeing another organization's data

### Metrics
- `softy_erp_tenant_isolation_violations_total` counter increases
- Anomalous query patterns in database audit logs

## Immediate Response (First 15 Minutes)

### 1. Confirm the Breach
```bash
# Check recent tenant security events
grep "TENANT_SECURITY" /var/log/softy-erp/app.log | tail -100

# Check for TenantMismatchException in last hour
grep "TenantMismatchException" /var/log/softy-erp/app.log | tail -50
```

### 2. Assess Impact
- **Single User?** May be a bug in a specific endpoint
- **Multiple Users?** Systemic issue, escalate immediately
- **Background Job?** Check cron job logs for affected data

### 3. Containment
If breach is confirmed and ongoing:

```bash
# Option A: Disable specific endpoint (if identified)
# Edit nginx or API gateway to return 503 for the affected route

# Option B: Enable maintenance mode (severe cases)
kubectl scale deployment softy-erp-api --replicas=0

# Option C: Disable background jobs
kubectl delete cronjob softy-erp-reconciliation
kubectl delete cronjob softy-erp-payout-processor
```

## Investigation

### 1. Identify Affected Tenants
```sql
-- Find cross-tenant access patterns in audit logs
SELECT DISTINCT 
  audit_log.user_tenant_id AS user_from,
  audit_log.entity_tenant_id AS accessed_tenant,
  audit_log.entity_type,
  audit_log.action,
  COUNT(*) as count
FROM audit_log
WHERE audit_log.user_tenant_id != audit_log.entity_tenant_id
  AND audit_log.created_at > NOW() - INTERVAL '24 hours'
GROUP BY 1, 2, 3, 4
ORDER BY count DESC;
```

### 2. Identify Root Cause

**Check for Query Builder Bypass:**
```bash
# Search for createQueryBuilder without tenant scope
grep -r "createQueryBuilder" backend/src/modules --include="*.ts" | \
  grep -v "TenantAwareRepository"
```

**Check for dataSource.getRepository:**
```bash
grep -r "dataSource.getRepository" backend/src/modules --include="*.ts"
```

**Check Background Jobs:**
```bash
# Look for cron jobs without TenantContextService.run
grep -r "@Cron" backend/src/modules --include="*.ts" -A 20 | \
  grep -v "TenantContextService.run"
```

### 3. Determine Data Exposure
```sql
-- List all data accessed across tenants
SELECT 
  entity_type,
  entity_id,
  action,
  user_id,
  user_tenant_id,
  entity_tenant_id,
  created_at
FROM audit_log
WHERE user_tenant_id != entity_tenant_id
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 1000;
```

## Remediation

### 1. Fix the Code
Apply one of these patterns depending on the issue:

**Missing Tenant Scope in Query Builder:**
```typescript
// Before (VULNERABLE)
const results = await this.repository
  .createQueryBuilder('e')
  .where('e.status = :status', { status })
  .getMany();

// After (FIXED)
const results = await this.tenantAwareRepository
  .createQueryBuilder('e')  // Auto-scoped
  .where('e.status = :status', { status })
  .getMany();
```

**Missing Tenant Context in Background Job:**
```typescript
// Before (VULNERABLE)
@Cron(CronExpression.EVERY_HOUR)
async process(): Promise<void> {
  const items = await this.repository.find(); // ALL TENANTS!
}

// After (FIXED)
@Cron(CronExpression.EVERY_HOUR)
async process(): Promise<void> {
  const tenants = await this.tenantsService.findAll();
  for (const tenant of tenants) {
    await TenantContextService.run(tenant.id, async () => {
      const items = await this.repository.find(); // Scoped
    });
  }
}
```

### 2. Deploy Fix
```bash
# Fast-track deployment for security fix
git checkout -b fix/tenant-isolation-breach
git add .
git commit -m "fix(security): patch tenant isolation vulnerability [SECURITY]"
git push origin fix/tenant-isolation-breach

# Create PR and merge immediately (bypass normal review for P1)
gh pr create --title "SECURITY: Tenant isolation fix" --body "P1 security fix"
gh pr merge --auto --squash
```

### 3. Verify Fix
```bash
# Run tenant isolation tests
npm run test:e2e -- --grep "tenant isolation"

# Manual verification
curl -H "Authorization: Bearer $TENANT_A_TOKEN" \
  "https://api.softy-erp.com/bookings/$TENANT_B_BOOKING_ID"
# Should return 403 or 404, NOT the booking
```

## Post-Incident

### 1. Notify Affected Tenants
If data was exposed:
- Compile list of affected tenant IDs
- Prepare disclosure email
- Coordinate with Legal/Compliance
- Send notification within 72 hours (GDPR requirement)

### 2. Audit Trail
Document in incident response system:
- Timeline of events
- Root cause
- Data exposure scope
- Remediation steps
- Preventive measures

### 3. Preventive Measures
- [ ] Add regression test for the specific vulnerability
- [ ] Run full codebase audit for similar patterns
- [ ] Enable ESLint rule `no-unsafe-tenant-context` in CI
- [ ] Review and update ADR-0006 if needed
- [ ] Schedule security training for team

## Escalation Path

| Time | Action |
|------|--------|
| 0 min | On-call engineer begins investigation |
| 15 min | If breach confirmed, page Security Team |
| 30 min | If data exposed, notify CTO |
| 1 hour | If not contained, invoke full incident response |
| 4 hours | Status update to affected tenants (if applicable) |
| 72 hours | GDPR notification deadline (if personal data exposed) |

## Contact Information

- **Security Team:** security@softy-erp.com, #security-incidents Slack
- **On-Call:** PagerDuty "Backend Engineering" rotation
- **CTO:** [Direct contact in internal wiki]

## Related Documentation

- [ADR-0006: Tenant Isolation Patterns](../adr/0006-tenant-isolation-patterns.md)
- [Security Incident Runbook](./security-incident.md)
- [API Security Guidelines](../API_SECURITY_GUIDELINES.md)
