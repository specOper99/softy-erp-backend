import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertBookingHandoverTypeToEnum20260427000000 implements MigrationInterface {
  name = 'ConvertBookingHandoverTypeToEnum20260427000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create the enum type (idempotent).
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_handover_type_enum') THEN
          CREATE TYPE "public"."booking_handover_type_enum" AS ENUM ('CASH', 'E_PAYMENT');
        END IF;
      END $$;
    `);

    // 2. Drop any existing free-form values that don't map to the new enum.
    //    Handover type was previously a varchar(100) with no validation.
    await queryRunner.query(`
      UPDATE "bookings"
      SET "handover_type" = NULL
      WHERE "handover_type" IS NOT NULL
        AND "handover_type" NOT IN ('CASH', 'E_PAYMENT');
    `);

    // 3. Convert the column type from varchar to the enum.
    await queryRunner.query(`
      ALTER TABLE "bookings"
      ALTER COLUMN "handover_type" TYPE "public"."booking_handover_type_enum"
      USING "handover_type"::"public"."booking_handover_type_enum";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert column to varchar(100).
    await queryRunner.query(`
      ALTER TABLE "bookings"
      ALTER COLUMN "handover_type" TYPE varchar(100)
      USING "handover_type"::text;
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."booking_handover_type_enum";`);
  }
}
