import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a plain index on audit_logs.created_at for time-range query performance.
 *
 * NOTE: The original intent of dropping the composite PK (id, created_at) in favour of
 * a single-column PK on id is impossible — audit_logs is partitioned BY RANGE("created_at"),
 * and PostgreSQL requires every unique/primary-key constraint on a partitioned table to
 * include all partition key columns. The composite PK (id, created_at) is therefore correct
 * and must be kept as-is.
 */
export class AuditLogDropCompositePkAndIndexCreatedAt1772400000000 implements MigrationInterface {
  name = 'AuditLogDropCompositePkAndIndexCreatedAt1772400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Index on created_at for time-range scans.
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_created_at" ON "audit_logs" ("created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_created_at"`);
  }
}
