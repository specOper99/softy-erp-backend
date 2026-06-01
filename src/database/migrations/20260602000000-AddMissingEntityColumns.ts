import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds columns and tables that entities reference but no previous migration created.
 *
 * Affected:
 *  1. outbox_events          – add "retryCount" integer column
 *  2. recurring_transactions – add failure_count integer, last_error text
 *  3. subscriptions          – add plan enum, start_date, end_date, auto_renew
 *  4. department_budgets     – create table (never had a migration)
 */
export class AddMissingEntityColumns20260602000000 implements MigrationInterface {
  name = 'AddMissingEntityColumns20260602000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 0. bookings.handover_type ─────────────────────────────────────────────
    // Safety net: 20260426000000 and 20260427000000 already add this column and
    // convert it to an enum. This block is a no-op when those migrations ran
    // correctly, but repairs the column if they were skipped (e.g. the bookings
    // table guard triggered on a partial DB).
    const [{ bk }] = (await queryRunner.query(`SELECT to_regclass('public.bookings') AS bk`)) as [
      { bk: string | null },
    ];

    if (bk) {
      // Ensure enum type exists.
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_type WHERE typname = 'booking_handover_type_enum'
          ) THEN
            CREATE TYPE "public"."booking_handover_type_enum" AS ENUM ('CASH', 'E_PAYMENT');
          END IF;
        END $$;
      `);

      // Check if column already exists; if not, add it as the enum type.
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name   = 'bookings'
              AND column_name  = 'handover_type'
          ) THEN
            ALTER TABLE "bookings"
              ADD COLUMN "handover_type"
                "public"."booking_handover_type_enum";
          END IF;
        END $$;
      `);
    }

    // ── 1. outbox_events ─────────────────────────────────────────────────────
    const [{ oe }] = (await queryRunner.query(`SELECT to_regclass('public.outbox_events') AS oe`)) as [
      { oe: string | null },
    ];

    if (oe) {
      await queryRunner.query(`
        ALTER TABLE "outbox_events"
          ADD COLUMN IF NOT EXISTS "retryCount" integer NOT NULL DEFAULT 0
      `);
    }

    // ── 2. recurring_transactions ─────────────────────────────────────────────
    const [{ rt }] = (await queryRunner.query(`SELECT to_regclass('public.recurring_transactions') AS rt`)) as [
      { rt: string | null },
    ];

    if (rt) {
      await queryRunner.query(`
        ALTER TABLE "recurring_transactions"
          ADD COLUMN IF NOT EXISTS "failure_count" integer NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "last_error" text
      `);
    }

    // ── 3. subscriptions ─────────────────────────────────────────────────────
    const [{ sub }] = (await queryRunner.query(`SELECT to_regclass('public.subscriptions') AS sub`)) as [
      { sub: string | null },
    ];

    if (sub) {
      // Create the plan enum type if it doesn't exist yet.
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_type WHERE typname = 'subscriptions_plan_enum'
          ) THEN
            CREATE TYPE "public"."subscriptions_plan_enum"
              AS ENUM ('FREE', 'PRO', 'ENTERPRISE');
          END IF;
        END $$;
      `);

      await queryRunner.query(`
        ALTER TABLE "subscriptions"
          ADD COLUMN IF NOT EXISTS "plan"
            "public"."subscriptions_plan_enum" NOT NULL DEFAULT 'FREE',
          ADD COLUMN IF NOT EXISTS "start_date"
            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          ADD COLUMN IF NOT EXISTS "end_date"
            TIMESTAMP WITH TIME ZONE,
          ADD COLUMN IF NOT EXISTS "auto_renew"
            boolean NOT NULL DEFAULT true
      `);
    }

    // ── 4. department_budgets ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "department_budgets" (
        "id"            uuid                     NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tenant_id"     uuid                     NOT NULL,
        "department"    character varying        NOT NULL,
        "budget_amount" numeric(15,4)            NOT NULL DEFAULT 0,
        "period"        character varying        NOT NULL,
        "start_date"    date                     NOT NULL,
        "end_date"      date                     NOT NULL,
        "notes"         text,
        CONSTRAINT "PK_department_budgets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_department_budgets_tenant_dept_period"
          UNIQUE ("tenant_id", "department", "period"),
        CONSTRAINT "FK_department_budgets_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_department_budgets_tenant"
        ON "department_budgets" ("tenant_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_department_budgets_period"
        ON "department_budgets" ("period")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse order: department_budgets first, then column drops.
    await queryRunner.query(`DROP TABLE IF EXISTS "department_budgets"`);

    await queryRunner.query(`
      ALTER TABLE "subscriptions"
        DROP COLUMN IF EXISTS "auto_renew",
        DROP COLUMN IF EXISTS "end_date",
        DROP COLUMN IF EXISTS "start_date",
        DROP COLUMN IF EXISTS "plan"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."subscriptions_plan_enum"`);

    await queryRunner.query(`
      ALTER TABLE "recurring_transactions"
        DROP COLUMN IF EXISTS "last_error",
        DROP COLUMN IF EXISTS "failure_count"
    `);

    await queryRunner.query(`
      ALTER TABLE "outbox_events"
        DROP COLUMN IF EXISTS "retryCount"
    `);

    // Note: we do NOT drop bookings.handover_type here — it is owned by
    // 20260426000000 / 20260427000000. Only drop if this migration was the one
    // that created it (i.e., those migrations never ran), but we can't easily
    // detect that, so leave it for safety.
  }
}
