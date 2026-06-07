import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `transactions.purchase_invoice_id` (reverse FK to `purchase_invoices`),
 * extending the "at most one parent" check constraint to include it.
 *
 * Why this exists
 * ---------------
 *  - A purchase invoice has always been linked to its expense transaction via
 *    `purchase_invoices.transaction_id` (1:1, transaction is the parent).
 *    But the transaction row itself had no back-reference, so it looked like
 *    a "zero-parent" transaction under the relaxed constraint
 *    (`CHK_transactions_at_most_one_parent`) — the same shape as a manual
 *    expense.  That ambiguity made the link impossible to query from the
 *    transaction side and made the XOR-style protection around purchase
 *    invoices unenforceable.
 *  - The original plan (TODO in `transaction.entity.ts`) was to add the column
 *    and extend the check constraint as soon as the FK was feasible.  This is
 *    that migration.
 *
 * What it does (in order)
 * -----------------------
 *  1. Add nullable `purchase_invoice_id` to `transactions` (idempotent).
 *  2. Backfill from the existing `purchase_invoices.transaction_id` link.
 *  3. Add a unique partial-friendly index on `(tenant_id, purchase_invoice_id)`
 *     to keep 1:1 parity with `IDX_purchase_invoices_tenant_transaction`.
 *  4. Drop and re-add `CHK_transactions_at_most_one_parent` so it now covers
 *     the new column.  Preflight refuses to run if existing rows already
 *     violate the new shape.
 *  5. Add the composite FK to `purchase_invoices(id, tenant_id)`.
 *
 * Rollback (`down()`)
 * --------------------
 *  - Drops the new FK, unique index, and column.
 *  - Re-adds the original 3-column at-most-one constraint (no preflight; the
 *    column going away makes the data shape acceptable again).
 *
 * Operational notes
 * -----------------
 *  - The new column is nullable, so the migration is safe to run while the
 *    application is up; new purchase-invoice writes that arrive after the
 *    column is added will simply leave it NULL temporarily and fail the
 *    at-most-one check only if they already have another parent set, which
 *    is not the case for fresh code paths.  Deploy the application change
 *    in the same window to keep the link populated.
 *  - The preflight deliberately runs AFTER the backfill, so an environment
 *    that has always created invoices via the service (with
 *    `purchase_invoices.transaction_id` set) is expected to pass.
 */
export class AddTransactionPurchaseInvoiceId20260607000000 implements MigrationInterface {
  name = 'AddTransactionPurchaseInvoiceId20260607000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ t }] = (await queryRunner.query(`SELECT to_regclass('public.transactions') AS t`)) as [
      { t: string | null },
    ];
    if (!t) {
      return; // transactions table does not exist yet — nothing to do
    }

    const [{ pi }] = (await queryRunner.query(`SELECT to_regclass('public.purchase_invoices') AS pi`)) as [
      { pi: string | null },
    ];
    if (!pi) {
      return; // purchase_invoices table does not exist yet — nothing to do
    }

    // ── 1. Add the column (nullable, idempotent) ────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD COLUMN IF NOT EXISTS "purchase_invoice_id" uuid NULL
    `);

    // ── 2. Backfill from the existing 1:1 link on the invoice side ──────────
    //    Idempotent: re-runs are a no-op (the WHERE clause guards on NULL).
    //    Composite join on (transaction_id, tenant_id) mirrors the composite
    //    FK that purchase_invoices already has to transactions.
    await queryRunner.query(`
      UPDATE "transactions" t
      SET "purchase_invoice_id" = pi."id"
      FROM "purchase_invoices" pi
      WHERE pi."transaction_id" = t."id"
        AND pi."tenant_id"      = t."tenant_id"
        AND t."purchase_invoice_id" IS NULL
    `);

    // ── 3. Unique index to mirror IDX_purchase_invoices_tenant_transaction ──
    //    Enforces 1:1 from the transaction side.  Uses a partial unique index
    //    so the many NULL rows for non-purchase-invoice transactions don't
    //    fight over a uniqueness slot.  (Standard SQL: NULLs are distinct in
    //    unique indexes, but a partial index expresses intent more clearly
    //    and matches the style used by UQ_transactions_reversal_of_id.)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_transactions_tenant_purchase_invoice"
        ON "transactions" ("tenant_id", "purchase_invoice_id")
        WHERE "purchase_invoice_id" IS NOT NULL
    `);

    // ── 4. Extend the at-most-one check constraint ──────────────────────────
    //    Preflight: refuse to swap the constraint if any existing row would
    //    violate the new shape (e.g. a row with two non-null parents from an
    //    accidental direct DB write).  We check AFTER backfill, so a clean
    //    environment that has always used the service should pass.
    const violationRows = (await queryRunner.query(`
      SELECT COUNT(*) AS cnt
      FROM "transactions"
      WHERE
        ( CASE WHEN "booking_id"        IS NOT NULL THEN 1 ELSE 0 END
        + CASE WHEN "task_id"           IS NOT NULL THEN 1 ELSE 0 END
        + CASE WHEN "payout_id"         IS NOT NULL THEN 1 ELSE 0 END
        + CASE WHEN "purchase_invoice_id" IS NOT NULL THEN 1 ELSE 0 END ) > 1
    `)) as { cnt: string }[];
    const violationCount = Number(violationRows[0]?.cnt ?? 0);
    if (violationCount > 0) {
      throw new Error(
        `Cannot apply AddTransactionPurchaseInvoiceId20260607000000: ${violationCount} ` +
          `transaction row(s) have more than one of {booking_id, task_id, payout_id, ` +
          `purchase_invoice_id} set. Re-adding the extended at-most-one constraint ` +
          `would violate those rows. Resolve them (keep only one parent) before retrying.`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "CHK_transactions_at_most_one_parent"
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "CHK_transactions_at_most_one_parent"
        CHECK (
          ( CASE WHEN "booking_id"          IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN "task_id"             IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN "payout_id"           IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN "purchase_invoice_id" IS NOT NULL THEN 1 ELSE 0 END ) <= 1
        )
    `);

    // ── 5. Composite FK to purchase_invoices(id, tenant_id) ─────────────────
    //    Mirrors the existing FK_purchase_invoice_transaction_composite
    //    (purchase_invoices → transactions) so both directions are symmetric.
    //    ON DELETE RESTRICT matches the inverse FK and prevents accidental
    //    cascade deletion of expense transactions when an invoice is removed.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_transaction_purchase_invoice_composite'
        ) THEN
          ALTER TABLE "transactions"
            ADD CONSTRAINT "FK_transaction_purchase_invoice_composite"
            FOREIGN KEY ("purchase_invoice_id", "tenant_id")
            REFERENCES "purchase_invoices"("id", "tenant_id")
            ON DELETE RESTRICT ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ t }] = (await queryRunner.query(`SELECT to_regclass('public.transactions') AS t`)) as [
      { t: string | null },
    ];
    if (!t) {
      return;
    }

    // Reverse order: FK, then index, then constraint, then column.
    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP CONSTRAINT IF EXISTS "FK_transaction_purchase_invoice_composite"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_transactions_tenant_purchase_invoice"`);

    // Restore the original 3-column at-most-one constraint.  We do NOT add
    // a preflight here — removing `purchase_invoice_id` from the row shape
    // cannot make the 3-column form any stricter for existing data.
    await queryRunner.query(`
      ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "CHK_transactions_at_most_one_parent"
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "CHK_transactions_at_most_one_parent"
        CHECK (
          ( CASE WHEN "booking_id" IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN "task_id"    IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN "payout_id"  IS NOT NULL THEN 1 ELSE 0 END ) <= 1
        )
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "purchase_invoice_id"
    `);
  }
}
