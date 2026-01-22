import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayoutIdempotencyKey1769900000000 implements MigrationInterface {
  name = 'AddPayoutIdempotencyKey1769900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payouts" ADD COLUMN "idempotency_key" text`);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_payouts_tenant_id_idempotency_key" ON "payouts" ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_payouts_tenant_id_idempotency_key"`);
    await queryRunner.query(`ALTER TABLE "payouts" DROP COLUMN "idempotency_key"`);
  }
}
