import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSrsGapColumns1740088800000 implements MigrationInterface {
  name = 'AddSrsGapColumns1740088800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Gap 1: revenueAccountCode on transactions
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "revenue_account_code" VARCHAR(64) NULL`,
    );

    // Gap 4: locationLink on bookings and tasks
    await queryRunner.query(`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "location_link" VARCHAR(500) NULL`);
    await queryRunner.query(`ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "location_link" VARCHAR(500) NULL`);

    // Gap 6: completionPercentage on bookings
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "completion_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "completion_percentage"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN IF EXISTS "location_link"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "location_link"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS "revenue_account_code"`);
  }
}
