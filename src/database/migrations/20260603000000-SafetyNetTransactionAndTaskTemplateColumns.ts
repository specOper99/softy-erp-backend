import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Safety-net migration covering columns that were either missed by earlier
 * migrations (task_templates.processing_type_id) or whose previous migrations
 * silently skipped due to runtime guards (transactions.reference,
 * reversal_of_id, voided_at, voided_by).
 *
 * All statements use IF NOT EXISTS / DO $$ checks so this is fully idempotent.
 */
export class SafetyNetTransactionAndTaskTemplateColumns20260603000000 implements MigrationInterface {
  name = 'SafetyNetTransactionAndTaskTemplateColumns20260603000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. task_templates.processing_type_id ──────────────────────────────────
    // No prior migration ever added this column. The table was created with
    // task_type_id (now dropped), but processing_type_id was never backfilled.
    const [{ tt }] = (await queryRunner.query(`SELECT to_regclass('public.task_templates') AS tt`)) as [
      { tt: string | null },
    ];

    if (tt) {
      await queryRunner.query(`
        ALTER TABLE "task_templates"
          ADD COLUMN IF NOT EXISTS "processing_type_id" text
      `);
    }

    // ── 2. transactions: reference, reversal_of_id, voided_at, voided_by ──────
    // 20260426000000 adds "reference" and 20260501000000 adds the reversal/void
    // columns — but those migrations' table-existence guards may have silently
    // skipped on some deployment paths.  This block is a guaranteed idempotent
    // fallback.
    const [{ tr }] = (await queryRunner.query(`SELECT to_regclass('public.transactions') AS tr`)) as [
      { tr: string | null },
    ];

    if (tr) {
      // reference column (owned by 20260426000000)
      await queryRunner.query(`
        ALTER TABLE "transactions"
          ADD COLUMN IF NOT EXISTS "reference" character varying(100)
      `);

      // reversal / void columns (owned by 20260501000000)
      await queryRunner.query(`
        ALTER TABLE "transactions"
          ADD COLUMN IF NOT EXISTS "reversal_of_id" uuid,
          ADD COLUMN IF NOT EXISTS "voided_at"      TIMESTAMP WITH TIME ZONE,
          ADD COLUMN IF NOT EXISTS "voided_by"      uuid
      `);

      // Foreign key: reversal_of_id → transactions.id
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'FK_transactions_reversal_of_id'
          ) THEN
            ALTER TABLE "transactions"
              ADD CONSTRAINT "FK_transactions_reversal_of_id"
              FOREIGN KEY ("reversal_of_id")
              REFERENCES "transactions"("id") ON DELETE RESTRICT;
          END IF;
        END $$;
      `);

      // Foreign key: voided_by → users.id (only if users table exists)
      const [{ u }] = (await queryRunner.query(`SELECT to_regclass('public.users') AS u`)) as [{ u: string | null }];

      if (u) {
        await queryRunner.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conname = 'FK_transactions_voided_by'
            ) THEN
              ALTER TABLE "transactions"
                ADD CONSTRAINT "FK_transactions_voided_by"
                FOREIGN KEY ("voided_by")
                REFERENCES "users"("id") ON DELETE SET NULL;
            END IF;
          END $$;
        `);
      }

      // Unique partial index: a transaction may only be reversed once.
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "UQ_transactions_reversal_of_id"
          ON "transactions" ("reversal_of_id")
          WHERE "reversal_of_id" IS NOT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_transactions_reversal_of_id"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "FK_transactions_voided_by"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "FK_transactions_reversal_of_id"`);
    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP COLUMN IF EXISTS "voided_by",
        DROP COLUMN IF EXISTS "voided_at",
        DROP COLUMN IF EXISTS "reversal_of_id",
        DROP COLUMN IF EXISTS "reference"
    `);
    await queryRunner.query(`
      ALTER TABLE "task_templates"
        DROP COLUMN IF EXISTS "processing_type_id"
    `);
  }
}
