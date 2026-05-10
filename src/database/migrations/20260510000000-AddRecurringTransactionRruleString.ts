import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a nullable `rrule_string` column to `recurring_transactions` so the
 * service layer can dual-write the RFC 5545 RRULE representation alongside
 * the legacy `frequency` + `interval` fields. The column is read by the
 * `rrule-helper` parallel-shadow path; the production cron continues to use
 * the legacy `calculateNextRunDate()` until the shadow comparison confirms
 * parity over a 30-day window. Drop the legacy fields in a follow-up
 * migration only after that window passes with zero disagreements.
 */
export class AddRecurringTransactionRruleString20260510000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recurring_transactions"
       ADD COLUMN IF NOT EXISTS "rrule_string" text NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "recurring_transactions" DROP COLUMN IF EXISTS "rrule_string"`);
  }
}
