# Security Incident Response Playbook

## 1. Alert Identification
**Trigger**: Alert from TruffleHog, Trivy, GuardDuty, or User Report.

### Initial Triage
- [ ] **Verify Severity**:
  - **P0 (Critical)**: Data breach, active exploit, exposed master key.
  - **P1 (High)**: Vulnerability in public endpoint, failed compliance check.
  - **P2 (Medium)**: Internal vulnerability, suspicious but blocked activity.

### Roles
- **Incident Commander (IC)**: [Name/Role] (e.g., CTO or Lead DevOps)
- **Scribe**: [Name/Role] (Documenting timeline)
- **Subject Matter Expert (SME)**: [Name/Role] (Engineer closest to the affected system)

## 2. Containment
**Objective**: Stop the bleeding.

### Secrets Leaked
1. **Revoke immediately**: Rotate the exposed key in the provider (AWS, Stripe, etc.).
2. **Invalidate Sessions**: If JWT/Session keys involved, rotate `JWT_SECRET` and force logout all users.
3. **Redeploy**: Push configuration changes to remove the secret from code/env.

### Application Exploit (RCE / Injection)
1. **WAF Block**: Add rule to AWS WAF / Cloudflare to block malicious IP/pattern.
2. **Scale Down/Pause**: If severe, put the application in "Maintenance Mode" or stop vulnerable containers.
3. **Database Lock**: If data exfiltration suspected, revoke application database write access.

## 3. Eradication & Recovery
**Objective**: Fix the root cause and restore service.

- [ ] **Patch**: Apply security patch or revert to last known good build.
- [ ] **Scan**: Run full TruffleHog/Trivy scan on the patched version.
- [ ] **Verify**: SME validates the fix in Staging.
- [ ] **Deploy**: Rollout fix to Production.

## 4. Post-Incident Activity
- [ ] **Retrospective**: Conduct "Blameless Post-Mortem" within 48h.
- [ ] **Report**: Generate compliance report (GDPR/SOC2) if data was impacted.
- [ ] **Backlog**: Create Jira tickets for preventative measures.

---

## Compliance Mapping

| Requirement | Control | Tool/Process |
|-------------|---------|--------------|
| **SOC2 CC7.1** (Detection) | CI/CD Vulnerability Scanning | Trivy / npm audit |
| **SOC2 CC6.1** (Security) | Secret Scanning | TruffleHog |
| **GDPR Art. 33** (Breach) | Incident Response Plan | This Playbook |
| **PCI-DSS 6.3** (Software) | IaC & Dependency Checks | Checkov / Dependabot |
