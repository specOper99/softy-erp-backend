# Disaster Recovery (DR) Plan

## 1. Objectives (SLAs)
- **RTO (Recovery Time Objective)**: 4 Hours. (Max time system can be down)
- **RPO (Recovery Point Objective)**: 1 Hour. (Max data loss allowed)

## 2. Backup Strategy
### Database (PostgreSQL)
- **Full Backups**: Daily at 02:00 UTC. Stored in S3 `backup-bucket/daily`. Retention: 30 days.
- **Incremental/WAL Logs**: Every 5 minutes. Stored in S3 `backup-bucket/wal`. Retention: 7 days.
- **Testing**: Automated restore test every Sunday to a staging environment.

### Application State
- **Docker Images**: Push to ECR/Registry with immutable tags.
- **Infrastructure**: Defined as Code (Terraform/Helm) in `infra/` repo.
- **Secrets**: Encrypted in Vault (backed up via Snapshot) or AWS Secrets Manager (Replicated).

## 3. Disaster Scenarios & Recovery Procedures

### Scenario A: Region Failure (AWS us-east-1 down)
**Trigger**: AWS Service Health Dashboard reports major outage.
**Response**:
1. **Redirect Traffic**: Update DNS (Route53) to failover to `us-west-2` (Warning: Passive/Cold standby).
2. **Database Promote**: Promote the cross-region Read Replica in `us-west-2` to Primary.
3. **Scale Up**: Increase container count in `us-west-2` cluster.
4. **Verify**: Check `/health` endpoints and critical user flows.

### Scenario B: Data Corruption / Accidental Deletion
**Trigger**: Developer deletes production table or huge bug corrupts data.
**Response**:
1. **Stop Writes**: Put API in maintenance mode to prevent further corruption.
2. **Point-In-Time Recovery (PITR)**: Use AWS RDS / Postgres WAL logs to restore DB to `T - 5 minutes` (before the event).
3. **Validate**: Verify data integrity on the restored instance.
4. **Swap**: Update connection strings to point to restored DB.
5. **Resume**: Disable maintenance mode.

## 4. Communication Plan
- **Status Page**: Update `status.erp.soft-y.org` immediately.
- **Internal**: Notify `#incidents` slack channel.
- **External**: Email impacted customers if RPO > 0 (data loss occurred).

## 5. Annual Drill
- **Schedule**: Q3 every year.
- **Scope**: Simulate Region Failure in Staging.
- **Success Criteria**: RTO < 4h met.
