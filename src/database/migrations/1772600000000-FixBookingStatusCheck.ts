import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FixBookingStatusCheck1772600000000 implements MigrationInterface {
  name = 'FixBookingStatusCheck1772600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Legacy rows may still carry IN_PROGRESS even though BookingStatus no longer includes it.
    await queryRunner.query(`
      UPDATE "bookings"
      SET "status" = 'CONFIRMED'
      WHERE "status"::text = 'IN_PROGRESS'
    `);

    await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "chk_booking_status_enum"`);

    await queryRunner.query(`
      ALTER TABLE "bookings"
      ADD CONSTRAINT "chk_booking_status_enum"
      CHECK ("status" IN ('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "chk_booking_status_enum"`);

    await queryRunner.query(`
      ALTER TABLE "bookings"
      ADD CONSTRAINT "chk_booking_status_enum"
      CHECK ("status" IN ('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED'))
    `);
  }
}
