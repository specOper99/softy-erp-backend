import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookingHandoverAndTransactionReference20260426000000 implements MigrationInterface {
  name = 'AddBookingHandoverAndTransactionReference20260426000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Guard: skip gracefully if either table doesn't exist yet (partial DB state).
    const [{ b }] = (await queryRunner.query(`SELECT to_regclass('public.bookings') AS b`)) as [{ b: string | null }];
    if (b) {
      await queryRunner.query(`
        ALTER TABLE "bookings"
          ADD COLUMN IF NOT EXISTS "handover_type" varchar(100) NULL
      `);
    }

    const [{ t }] = (await queryRunner.query(`SELECT to_regclass('public.transactions') AS t`)) as [
      { t: string | null },
    ];
    if (t) {
      await queryRunner.query(`
        ALTER TABLE "transactions"
          ADD COLUMN IF NOT EXISTS "reference" varchar(100) NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS "reference"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "handover_type"`);
  }
}
