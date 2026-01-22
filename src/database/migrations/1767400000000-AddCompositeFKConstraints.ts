import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Composite FK Constraints for Tenant Isolation
 *
 * This migration enforces tenant isolation at the database level by adding
 * composite foreign key constraints that reference both the ID and tenant_id
 * of parent tables. This prevents cross-tenant data references.
 *
 * All operations are IDEMPOTENT using IF NOT EXISTS and conditional checks.
 */
export class AddCompositeFKConstraints1767400000000 implements MigrationInterface {
  name = 'AddCompositeFKConstraints1767400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // =========================================================================
    // Step 1: Add unique composite indexes on parent tables (id, tenant_id)
    // =========================================================================

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_composite_tenant"
      ON "users" ("id", "tenant_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_booking_composite_tenant"
      ON "bookings" ("id", "tenant_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_task_composite_tenant"
      ON "tasks" ("id", "tenant_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_package_composite_tenant"
      ON "service_packages" ("id", "tenant_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tasktype_composite_tenant"
      ON "task_types" ("id", "tenant_id")
    `);

    // =========================================================================
    // Step 2: Add composite FK constraints (ALL IDEMPOTENT)
    // =========================================================================

    await queryRunner.query(`
      DO $$
      BEGIN
        -- tasks.booking_id -> bookings
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_task_booking_composite') THEN
          ALTER TABLE "tasks" ADD CONSTRAINT "FK_task_booking_composite"
          FOREIGN KEY ("booking_id", "tenant_id") REFERENCES "bookings"("id", "tenant_id") ON DELETE CASCADE;
        END IF;

        -- tasks.task_type_id -> task_types
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_task_tasktype_composite') THEN
          ALTER TABLE "tasks" ADD CONSTRAINT "FK_task_tasktype_composite"
          FOREIGN KEY ("task_type_id", "tenant_id") REFERENCES "task_types"("id", "tenant_id");
        END IF;

        -- bookings.package_id -> service_packages
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_booking_package_composite') THEN
          ALTER TABLE "bookings" ADD CONSTRAINT "FK_booking_package_composite"
          FOREIGN KEY ("package_id", "tenant_id") REFERENCES "service_packages"("id", "tenant_id");
        END IF;

        -- package_items.package_id -> service_packages
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_item_package_composite') THEN
          ALTER TABLE "package_items" ADD CONSTRAINT "FK_item_package_composite"
          FOREIGN KEY ("package_id", "tenant_id") REFERENCES "service_packages"("id", "tenant_id") ON DELETE CASCADE;
        END IF;

        -- package_items.task_type_id -> task_types
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_item_tasktype_composite') THEN
          ALTER TABLE "package_items" ADD CONSTRAINT "FK_item_tasktype_composite"
          FOREIGN KEY ("task_type_id", "tenant_id") REFERENCES "task_types"("id", "tenant_id") ON DELETE CASCADE;
        END IF;

        -- employee_wallets.user_id -> users
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_wallet_user_composite') THEN
          ALTER TABLE "employee_wallets" ADD CONSTRAINT "FK_wallet_user_composite"
          FOREIGN KEY ("user_id", "tenant_id") REFERENCES "users"("id", "tenant_id");
        END IF;

        -- profiles.user_id -> users
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_profile_user_composite') THEN
          ALTER TABLE "profiles" ADD CONSTRAINT "FK_profile_user_composite"
          FOREIGN KEY ("user_id", "tenant_id") REFERENCES "users"("id", "tenant_id");
        END IF;

        -- tasks.assigned_user_id -> users
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_task_user_composite') THEN
          ALTER TABLE "tasks" ADD CONSTRAINT "FK_task_user_composite"
          FOREIGN KEY ("assigned_user_id", "tenant_id") REFERENCES "users"("id", "tenant_id");
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "FK_profile_user_composite"`);
    await queryRunner.query(`ALTER TABLE "employee_wallets" DROP CONSTRAINT IF EXISTS "FK_wallet_user_composite"`);
    await queryRunner.query(`ALTER TABLE "package_items" DROP CONSTRAINT IF EXISTS "FK_item_tasktype_composite"`);
    await queryRunner.query(`ALTER TABLE "package_items" DROP CONSTRAINT IF EXISTS "FK_item_package_composite"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "FK_booking_package_composite"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "FK_task_tasktype_composite"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "FK_task_booking_composite"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "FK_task_user_composite"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_tasktype_composite_tenant"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_package_composite_tenant"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_task_composite_tenant"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_booking_composite_tenant"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_user_composite_tenant"`);
  }
}
