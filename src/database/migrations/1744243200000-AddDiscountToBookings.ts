import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDiscountToBookings1744243200000 implements MigrationInterface {
  name = 'AddDiscountToBookings1744243200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "discount_amount"`);
  }
}
