# Database Rollback Runbook

## 1. Migration Revert
**Scenario**: A deployment introduced a bad migration that breaks the app (e.g., incorrect column type, missing index constraint).
**Condition**: Data has NOT been corrupted, just the schema is wrong.

### Procedure
1.  **Identify Version**: Find the timestamp of the bad migration (e.g., `20240101120000`).
2.  **Stop App**: Scale down the deployment to 0 replicas to prevent writes during revert (Optional but recommended).
3.  **Run Down Migration**:
    ```bash
    npm run migration:revert
    ```
    *Note: TypeORM reverts the last executed migration.*
4.  **Verify Schema**: Check DB to ensure the change is undone.
5.  **Fix Code**: Revert the code change in Git and redeploy the previous version.

## 2. Data Restore (Point-in-Time)
**Scenario**: A migration or script corrupted data (e.g., `UPDATE users SET email=null` without where clause).
**Condition**: Schema might be fine, but data is lost.

### Procedure
1.  **Determine Timestamp**: Find the exact time BEFORE the corruption occurred (e.g., `14:05 UTC`).
2.  **Initiate PITR**:
    - Go to AWS RDS Console -> "Restore to point in time".
    - Select the time `14:00 UTC` (buffer required).
    - Launch as a NEW DB Instance (e.g., `production-restore-v1`).
3.  **Validate**: Connect to the new DB instance and verify data integrity.
4.  **Switchover**:
    - Update `DATABASE_HOST` secret in Vault/K8s to point to `production-restore-v1`.
    - Restart Application.
5.  **Post-Mortem**: Investigate why local testing failed.

## 3. Backfill Strategy (Forward Fix)
**Scenario**: A migration added a column but failed to populate it for existing rows.
**Procedure**:
1.  Do NOT revert if schema is compatible.
2.  Create a strict **Data Migration Script** (idempotent code).
3.  Run script in batch mode (e.g., 1000 rows at a time) to backfill the missing data.
