import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillRecurringTransactionRruleString20260603100000 implements MigrationInterface {
  name = 'BackfillRecurringTransactionRruleString20260603100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE recurring_transactions
      SET rrule_string = CONCAT(
        'DTSTART:', to_char(start_date, 'YYYYMMDD'), 'T000000Z',
        E'\\nRRULE:FREQ=', CASE frequency
          WHEN 'DAILY' THEN 'DAILY;INTERVAL=' || "interval"::text
          WHEN 'WEEKLY' THEN 'WEEKLY;INTERVAL=' || "interval"::text
          WHEN 'BIWEEKLY' THEN 'WEEKLY;INTERVAL=' || ("interval" * 2)::text
          WHEN 'MONTHLY' THEN 'MONTHLY;INTERVAL=' || "interval"::text
          WHEN 'QUARTERLY' THEN 'MONTHLY;INTERVAL=' || ("interval" * 3)::text
          WHEN 'YEARLY' THEN 'YEARLY;INTERVAL=' || "interval"::text
        END
      )
      WHERE rrule_string IS NULL;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Backfill migrations are generally one-way since we cannot know
    // which records were null prior to the migration.
  }
}
