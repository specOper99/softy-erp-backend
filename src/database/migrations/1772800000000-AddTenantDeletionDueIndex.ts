import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantDeletionDueIndex1772800000000 implements MigrationInterface {
  name = 'AddTenantDeletionDueIndex1772800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tenants_pending_deletion_due
      ON tenants (deletion_scheduled_at)
      WHERE status = 'PENDING_DELETION'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tenants_pending_deletion_due`);
  }
}
