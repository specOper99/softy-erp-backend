import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayoutStatusIndex1681234567891 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add index on status and tenantId for faster lookups
    await queryRunner.query(`CREATE INDEX "IDX_payouts_status_tenant" ON "payouts" ("status", "tenant_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_payouts_status_tenant"`);
  }
}
