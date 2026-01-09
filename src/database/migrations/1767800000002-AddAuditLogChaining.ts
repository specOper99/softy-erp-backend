import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLogChaining1767800000002 implements MigrationInterface {
  name = 'AddAuditLogChaining1767800000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "audit_logs" 
      ADD COLUMN IF NOT EXISTS "hash" character varying(64),
      ADD COLUMN IF NOT EXISTS "previous_hash" character varying(64),
      ADD COLUMN IF NOT EXISTS "sequence_number" bigint
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_hash" ON "audit_logs" ("hash")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_sequence" ON "audit_logs" ("tenant_id", "sequence_number")
    `);

    await queryRunner.query(`
      CREATE RULE prevent_audit_update AS ON UPDATE TO "audit_logs" DO INSTEAD NOTHING
    `);

    await queryRunner.query(`
      CREATE RULE prevent_audit_delete AS ON DELETE TO "audit_logs" DO INSTEAD NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP RULE IF EXISTS prevent_audit_delete ON "audit_logs"`,
    );
    await queryRunner.query(
      `DROP RULE IF EXISTS prevent_audit_update ON "audit_logs"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_audit_logs_sequence"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_audit_logs_hash"`,
    );
    await queryRunner.query(`
      ALTER TABLE "audit_logs"
      DROP COLUMN IF EXISTS "sequence_number",
      DROP COLUMN IF EXISTS "previous_hash",
      DROP COLUMN IF EXISTS "hash"
    `);
  }
}
