import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDashboardIndexes1735858000000 implements MigrationInterface {
  name = 'AddDashboardIndexes1735858000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Index for booking date filtering (dashboard queries)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bookings_tenant_event_date" 
      ON "bookings" ("tenant_id", "event_date")
    `);

    // Index for booking status and date (dashboard KPIs)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bookings_tenant_status_date" 
      ON "bookings" ("tenant_id", "status", "event_date")
    `);

    // Index for transaction date filtering (revenue reports)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transactions_tenant_date" 
      ON "transactions" ("tenant_id", "transaction_date")
    `);

    // Index for transaction type and date (income/expense analysis)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transactions_tenant_type_date" 
      ON "transactions" ("tenant_id", "type", "transaction_date")
    `);

    // Index for task completion tracking (staff performance)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tasks_tenant_completed_date" 
      ON "tasks" ("tenant_id", "completed_at")
      WHERE "completed_at" IS NOT NULL
    `);

    // Index for task assignment and status
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tasks_tenant_status" 
      ON "tasks" ("tenant_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_bookings_tenant_event_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_bookings_tenant_status_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transactions_tenant_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transactions_tenant_type_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_tasks_tenant_completed_date"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tasks_tenant_status"`);
  }
}
