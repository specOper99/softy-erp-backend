import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aligns PostgreSQL enum types with TypeScript enums used at runtime.
 * Without these values, tenant lifecycle, IQD currency defaults, refunds,
 * recurring transaction failures, and CLIENT role writes fail with 22P02.
 */
export class AddMissingEnumValues1772500000000 implements MigrationInterface {
  name = 'AddMissingEnumValues1772500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenants_status_enum') THEN
          ALTER TYPE "public"."tenants_status_enum" ADD VALUE IF NOT EXISTS 'GRACE_PERIOD';
          ALTER TYPE "public"."tenants_status_enum" ADD VALUE IF NOT EXISTS 'LOCKED';
          ALTER TYPE "public"."tenants_status_enum" ADD VALUE IF NOT EXISTS 'PENDING_DELETION';
          ALTER TYPE "public"."tenants_status_enum" ADD VALUE IF NOT EXISTS 'DELETED';
        END IF;

        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'currency_enum') THEN
          ALTER TYPE "public"."currency_enum" ADD VALUE IF NOT EXISTS 'IQD';
        END IF;

        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transactions_type_enum') THEN
          ALTER TYPE "public"."transactions_type_enum" ADD VALUE IF NOT EXISTS 'REFUND';
        END IF;

        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recurring_transactions_status_enum') THEN
          ALTER TYPE "public"."recurring_transactions_status_enum" ADD VALUE IF NOT EXISTS 'FAILED';
        END IF;

        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'users_role_enum') THEN
          ALTER TYPE "public"."users_role_enum" ADD VALUE IF NOT EXISTS 'CLIENT';
        END IF;
      END $$;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: enum values cannot be removed safely in PostgreSQL
  }
}
