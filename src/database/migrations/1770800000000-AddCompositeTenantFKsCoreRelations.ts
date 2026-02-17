import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompositeTenantFKsCoreRelations1770800000000 implements MigrationInterface {
  name = 'AddCompositeTenantFKsCoreRelations1770800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_client_composite_tenant"
      ON "clients" ("id", "tenant_id")
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
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_webhook_composite_tenant"
      ON "webhooks" ("id", "tenant_id")
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_bookings_client_id') THEN
          ALTER TABLE "bookings" DROP CONSTRAINT "FK_bookings_client_id";
        END IF;

        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_invoices_booking_id') THEN
          ALTER TABLE "invoices" DROP CONSTRAINT "FK_invoices_booking_id";
        END IF;

        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_time_entries_task') THEN
          ALTER TABLE "time_entries" DROP CONSTRAINT "FK_time_entries_task";
        END IF;

        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_webhook_deliveries_webhook') THEN
          ALTER TABLE "webhook_deliveries" DROP CONSTRAINT "FK_webhook_deliveries_webhook";
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_booking_client_composite') THEN
          ALTER TABLE "bookings"
            ADD CONSTRAINT "FK_booking_client_composite"
            FOREIGN KEY ("client_id", "tenant_id") REFERENCES "clients"("id", "tenant_id")
            ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_invoice_booking_composite') THEN
          ALTER TABLE "invoices"
            ADD CONSTRAINT "FK_invoice_booking_composite"
            FOREIGN KEY ("booking_id", "tenant_id") REFERENCES "bookings"("id", "tenant_id")
            ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_time_entry_task_composite') THEN
          ALTER TABLE "time_entries"
            ADD CONSTRAINT "FK_time_entry_task_composite"
            FOREIGN KEY ("task_id", "tenant_id") REFERENCES "tasks"("id", "tenant_id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_webhook_delivery_webhook_composite') THEN
          ALTER TABLE "webhook_deliveries"
            ADD CONSTRAINT "FK_webhook_delivery_webhook_composite"
            FOREIGN KEY ("webhook_id", "tenant_id") REFERENCES "webhooks"("id", "tenant_id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_webhook_delivery_webhook_composite') THEN
          ALTER TABLE "webhook_deliveries" DROP CONSTRAINT "FK_webhook_delivery_webhook_composite";
        END IF;

        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_time_entry_task_composite') THEN
          ALTER TABLE "time_entries" DROP CONSTRAINT "FK_time_entry_task_composite";
        END IF;

        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_invoice_booking_composite') THEN
          ALTER TABLE "invoices" DROP CONSTRAINT "FK_invoice_booking_composite";
        END IF;

        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_booking_client_composite') THEN
          ALTER TABLE "bookings" DROP CONSTRAINT "FK_booking_client_composite";
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_bookings_client_id') THEN
          ALTER TABLE "bookings"
            ADD CONSTRAINT "FK_bookings_client_id"
            FOREIGN KEY ("client_id") REFERENCES "clients"("id")
            ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_invoices_booking_id') THEN
          ALTER TABLE "invoices"
            ADD CONSTRAINT "FK_invoices_booking_id"
            FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
            ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_time_entries_task') THEN
          ALTER TABLE "time_entries"
            ADD CONSTRAINT "FK_time_entries_task"
            FOREIGN KEY ("task_id") REFERENCES "tasks"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_webhook_deliveries_webhook') THEN
          ALTER TABLE "webhook_deliveries"
            ADD CONSTRAINT "FK_webhook_deliveries_webhook"
            FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_client_composite_tenant"`);
  }
}
