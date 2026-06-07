import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveHandoverTypeFromBookings20260608000000 implements MigrationInterface {
  name = 'RemoveHandoverTypeFromBookings20260608000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "handover_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."booking_handover_type_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."booking_handover_type_enum" AS ENUM('CASH', 'E_PAYMENT')`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD "handover_type" "public"."booking_handover_type_enum"`);
  }
}
