import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Align notification_type PostgreSQL enums with NotificationType TS enum.
 * BOOKING_COMPLETED was added in app code without a DB migration; production
 * schema validation refuses to boot until the labels exist.
 */
export class AddBookingCompletedNotificationType1773100000000 implements MigrationInterface {
  name = 'AddBookingCompletedNotificationType1773100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'notifications_notification_type_enum'
            AND n.nspname = 'public'
        ) THEN
          ALTER TYPE "public"."notifications_notification_type_enum"
            ADD VALUE IF NOT EXISTS 'BOOKING_COMPLETED';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'notification_preferences_notification_type_enum'
            AND n.nspname = 'public'
        ) THEN
          ALTER TYPE "public"."notification_preferences_notification_type_enum"
            ADD VALUE IF NOT EXISTS 'BOOKING_COMPLETED';
        END IF;
      END $$;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: PostgreSQL cannot safely remove enum labels once in use.
  }
}
