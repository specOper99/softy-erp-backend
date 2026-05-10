import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentMethodToTransactions1744243202000 implements MigrationInterface {
  name = 'AddPaymentMethodToTransactions1744243202000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "payment_method" VARCHAR(50) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS "payment_method"`);
  }
}
