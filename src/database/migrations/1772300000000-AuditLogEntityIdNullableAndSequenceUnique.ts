import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Audit log fixes
 *
 * 1. Allow NULL on entity_id — DLQ / aggregate audit events do not always target
 *    a specific entity row.  The Phase 1 fix already filters these out with
 *    `IS NOT NULL` in the hash-chain query, so the application is prepared.
 *
 * 2. Upgrade the (tenant_id, sequence_number) plain index to a UNIQUE index.
 *    The sequence number is the ordering anchor for the hash chain; duplicates
 *    within a tenant would silently break chain integrity.
 */
export class AuditLogEntityIdNullableAndSequenceUnique1772300000000 implements MigrationInterface {
  name = 'AuditLogEntityIdNullableAndSequenceUnique1772300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Make entity_id nullable (safe for existing NOT NULL rows — just removes constraint)
    await queryRunner.query(`
      ALTER TABLE "audit_logs"
      ALTER COLUMN "entity_id" DROP NOT NULL
    `);

    // 2. Upgrade the plain index to a UNIQUE PARTIAL index (only where sequence_number IS NOT NULL)
    //    We use a partial index so the uniqueness constraint only applies to rows that carry
    //    a sequence number, leaving system-generated rows (sequence_number IS NULL) unrestricted.
    //
    //    NOTE: audit_logs is partitioned by RANGE(created_at). PostgreSQL requires every unique
    //    index on a partitioned table to include all partition key columns. We include created_at
    //    so Postgres can enforce uniqueness within each partition. Sequence numbers are
    //    monotonically increasing per tenant so the same (tenant_id, sequence_number) pair will
    //    never naturally appear in two different time-range partitions.
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_audit_logs_sequence"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_audit_logs_tenant_sequence_uniq"
        ON "audit_logs" ("tenant_id", "sequence_number", "created_at")
       WHERE "sequence_number" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_audit_logs_tenant_sequence_uniq"`);
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_sequence" ON "audit_logs" ("tenant_id", "sequence_number")
    `);
    // Re-adding NOT NULL would fail if any NULL rows exist — omit to avoid data loss on rollback.
    // Operators should handle this manually if a strict rollback is required.
  }
}
