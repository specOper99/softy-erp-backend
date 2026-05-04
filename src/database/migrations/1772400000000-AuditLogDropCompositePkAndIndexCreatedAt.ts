import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes the composite primary key (id, created_at) on audit_logs, leaving id as the sole PK.
 * Adds a plain index on created_at for time-range query performance.
 *
 * Background: TypeORM's @CreateDateColumn({ primary: true }) produced a composite PK which
 * prevented partial-index queries and added unnecessary storage overhead. The id UUID column
 * is sufficient as the unique row identifier.
 */
export class AuditLogDropCompositePkAndIndexCreatedAt1772400000000 implements MigrationInterface {
  name = 'AuditLogDropCompositePkAndIndexCreatedAt1772400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the composite PK (id, created_at) and restore a single-column PK on id.
    // TypeORM generates PK constraint names as "PK_<tablename>" for simple cases;
    // the composite form may use the same name — DROP + ADD is idempotent-safe.
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "PK_audit_logs"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")`);

    // Index on created_at for time-range scans.
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_created_at" ON "audit_logs" ("created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_created_at"`);

    // Restore composite PK — note: this may fail if rows exist with duplicate (id, created_at)
    // combinations, which cannot happen in practice given id is a UUID PK.
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "PK_audit_logs"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id", "created_at")`);
  }
}
