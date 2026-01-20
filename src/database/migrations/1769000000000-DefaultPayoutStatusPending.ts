import { MigrationInterface, QueryRunner } from 'typeorm';

export class DefaultPayoutStatusPending1769000000000 implements MigrationInterface {
  name = 'DefaultPayoutStatusPending1769000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payouts" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payouts" ALTER COLUMN "status" SET DEFAULT 'COMPLETED'`);
  }
}
