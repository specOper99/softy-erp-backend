import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantIdToProfileFinal1767092139714 implements MigrationInterface {
  name = 'AddTenantIdToProfileFinal1767092139714';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" ADD "tenant_id" character varying NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_b3cf4b94987d3b77e9242af37e" ON "profiles" ("tenant_id") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_b3cf4b94987d3b77e9242af37e"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "tenant_id"`);
  }
}
