import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantIdToAuditLogs1703950000000 implements MigrationInterface {
  name = 'AddTenantIdToAuditLogs1703950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add tenant_id column to audit_logs
    await queryRunner.query(`
      ALTER TABLE "audit_logs" ADD "tenant_id" uuid
    `);

    // Create index for tenant-scoped queries
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_tenant" ON "audit_logs" ("tenant_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_audit_logs_tenant"
    `);

    // Remove column
    await queryRunner.query(`
      ALTER TABLE "audit_logs" DROP COLUMN "tenant_id"
    `);
  }
}
