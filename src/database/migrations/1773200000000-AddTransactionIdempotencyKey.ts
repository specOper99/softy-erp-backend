import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionIdempotencyKey1773200000000 implements MigrationInterface {
  name = 'AddTransactionIdempotencyKey1773200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" ADD COLUMN "idempotency_key" text`);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_transactions_tenant_id_idempotency_key" ON "transactions" ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_transactions_tenant_id_idempotency_key"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "idempotency_key"`);
  }
}
