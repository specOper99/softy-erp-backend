import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateTransactionCategories1767800000005 implements MigrationInterface {
  name = 'UpdateTransactionCategories1767800000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" ADD "category_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_transactions_category" FOREIGN KEY ("category_id") REFERENCES "transaction_categories"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_transactions_category"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "category_id"`);
  }
}
