import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds performance indexes for common query patterns identified in code analysis.
 *
 * These indexes optimize:
 * - Bookings filtered by tenant and status
 * - Tasks filtered by booking and assigned user
 * - Refresh tokens looked up by hash
 * - Transactions filtered by tenant and date
 * - Audit logs filtered by entity and date
 */
export class AddPerformanceIndexes1703859449000 implements MigrationInterface {
  name = 'AddPerformanceIndexes1703859449000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Bookings: frequently filtered by tenant and status
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_tenant_status 
      ON bookings(tenant_id, status)
    `);

    // Tasks: filtered by booking
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_booking 
      ON tasks(booking_id)
    `);

    // Tasks: filtered by assigned user
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_user 
      ON tasks(assigned_user_id)
    `);

    // Tasks: filtered by tenant and status
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status 
      ON tasks(tenant_id, status)
    `);

    // Refresh tokens: queried by hash for validation
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash 
      ON refresh_tokens(token_hash)
    `);

    // Refresh tokens: queried by user for session management
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user 
      ON refresh_tokens(user_id)
    `);

    // Transactions: filtered by tenant and date range
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_tenant_date 
      ON transactions(tenant_id, transaction_date)
    `);

    // Transactions: filtered by reference for lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_reference 
      ON transactions(reference_type, reference_id)
    `);

    // Audit logs: filtered by entity type and date
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_date 
      ON audit_logs(entity_name, created_at)
    `);

    // Attachments: filtered by booking
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_attachments_booking 
      ON attachments(booking_id)
    `);

    // Attachments: filtered by task
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_attachments_task 
      ON attachments(task_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_bookings_tenant_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tasks_booking`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tasks_assigned_user`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tasks_tenant_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_refresh_tokens_hash`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_refresh_tokens_user`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_transactions_tenant_date`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_transactions_reference`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_logs_entity_date`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_attachments_booking`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_attachments_task`);
  }
}
