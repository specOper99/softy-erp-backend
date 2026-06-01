import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameTransactionCategoryColumns20260601000000 implements MigrationInterface {
  name = 'RenameTransactionCategoryColumns20260601000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transaction_categories" RENAME COLUMN "isActive" TO "is_active"`);
    await queryRunner.query(`ALTER TABLE "transaction_categories" RENAME COLUMN "parentId" TO "parent_id"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transaction_categories" RENAME COLUMN "parent_id" TO "parentId"`);
    await queryRunner.query(`ALTER TABLE "transaction_categories" RENAME COLUMN "is_active" TO "isActive"`);
  }
}
