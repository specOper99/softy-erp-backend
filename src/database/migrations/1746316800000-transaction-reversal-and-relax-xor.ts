import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransactionReversalAndRelaxXor1746316800000 implements MigrationInterface {
  name = 'TransactionReversalAndRelaxXor1746316800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop the strict XOR CHECK constraint that required exactly one of
    //    {booking_id, task_id, payout_id}.  Manual, recurring, purchase-invoice,
    //    and reversal transactions legitimately have none of them.
    //
    //    The constraint name is resolved dynamically rather than hard-coded because
    //    TypeORM-generated names depend on the naming strategy and migration history.
    //    A hard-coded name with IF EXISTS would silently no-op in any environment
    //    where the name differs, leaving the old strict XOR in place and causing
    //    every reversal/manual INSERT to fail with a check-constraint violation.
    const xorConstraintRows = (await queryRunner.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'transactions'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%booking_id%task_id%payout_id%'
    `)) as { conname: string }[];
    for (const { conname } of xorConstraintRows) {
      await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "${conname}"`);
    }

    // 2. Re-add as "at most one" — zero is now allowed.
    // TODO: include purchase_invoice_id once that FK lands
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "CHK_transactions_at_most_one_parent"` +
        ` CHECK (` +
        `(CASE WHEN booking_id IS NOT NULL THEN 1 ELSE 0 END +` +
        ` CASE WHEN task_id    IS NOT NULL THEN 1 ELSE 0 END +` +
        ` CASE WHEN payout_id  IS NOT NULL THEN 1 ELSE 0 END) <= 1)`,
    );

    // 3. Add void / reversal columns.
    await queryRunner.query(
      `ALTER TABLE "transactions"` +
        ` ADD COLUMN IF NOT EXISTS "reversal_of_id" UUID NULL,` +
        ` ADD COLUMN IF NOT EXISTS "voided_at"      TIMESTAMPTZ NULL,` +
        ` ADD COLUMN IF NOT EXISTS "voided_by"      UUID NULL`,
    );

    // 4. Foreign keys for the new columns.
    await queryRunner.query(
      `ALTER TABLE "transactions"` +
        ` ADD CONSTRAINT "FK_transactions_reversal_of_id"` +
        ` FOREIGN KEY ("reversal_of_id") REFERENCES "transactions"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions"` +
        ` ADD CONSTRAINT "FK_transactions_voided_by"` +
        ` FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL`,
    );

    // 5. Unique partial index: a transaction may be reversed at most once.
    //    Concurrent void calls will race on this constraint; the loser gets a
    //    unique-violation which the service layer translates to ConflictException.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_transactions_reversal_of_id"` +
        ` ON "transactions" ("reversal_of_id")` +
        ` WHERE "reversal_of_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop new index and FKs first.
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_transactions_reversal_of_id"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "FK_transactions_reversal_of_id"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "FK_transactions_voided_by"`);

    // Drop columns.
    await queryRunner.query(
      `ALTER TABLE "transactions"` +
        ` DROP COLUMN IF EXISTS "reversal_of_id",` +
        ` DROP COLUMN IF EXISTS "voided_at",` +
        ` DROP COLUMN IF EXISTS "voided_by"`,
    );

    // Drop the relaxed constraint.
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "CHK_transactions_at_most_one_parent"`,
    );

    // Preflight: refuse to restore the strict XOR constraint if any zero-parent
    // rows exist (manual, recurring, reversal transactions).  Deleting them
    // silently would cause irreversible data loss, so we abort instead and let
    // the operator decide (archive or reassign those rows before re-running).
    const zeroParentRows = (await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM "transactions" WHERE booking_id IS NULL AND task_id IS NULL AND payout_id IS NULL`,
    )) as { cnt: string }[];
    const zeroParentCount = Number(zeroParentRows[0]?.cnt ?? 0);
    if (zeroParentCount > 0) {
      throw new Error(
        `Cannot roll back migration: ${zeroParentCount} transaction(s) have no parent ` +
          `(booking_id, task_id, and payout_id are all NULL). ` +
          `Re-adding the strict XOR constraint would violate those rows. ` +
          `Archive or reassign those rows before retrying the rollback.`,
      );
    }

    // Restore the strict XOR constraint using the original TypeORM-generated name.
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "CHK_3c04c8c3a9eb587dc4119d404b"` +
        ` CHECK (` +
        `("booking_id" IS NOT NULL AND "task_id" IS NULL    AND "payout_id" IS NULL) OR` +
        `("booking_id" IS NULL    AND "task_id" IS NOT NULL AND "payout_id" IS NULL) OR` +
        `("booking_id" IS NULL    AND "task_id" IS NULL    AND "payout_id" IS NOT NULL))`,
    );
  }
}
