import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Critical Indexes and Constraints
 *
 * Addresses audit defects #5, #12, #23-27, #45-51:
 * - Composite indexes for pagination and filtered queries
 * - Invoice unique constraint to prevent duplicates
 * - Single-column indexes for common lookups
 * - Failure tracking columns for recurring transactions
 */
export class AddCriticalIndexesAndConstraints1736389200000 implements MigrationInterface {
  name = 'AddCriticalIndexesAndConstraints1736389200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // === COMPOSITE INDEXES FOR PAGINATION ===

    // 1. Booking pagination index (high traffic)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_booking_tenant_created
      ON bookings(tenant_id, created_at DESC);
    `);

    // 2. Task queries index with partial filter for pending tasks
    // status column in task table is enum, ensure consistent naming
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_task_tenant_status_due
      ON tasks(tenant_id, status, due_date)
      WHERE status = 'PENDING';
    `);

    // 3. Transaction filtered queries index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_transaction_tenant_type_date
      ON transactions(tenant_id, type, transaction_date DESC);
    `);

    // 4. Audit log retrieval index (high volume table)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_tenant_created
      ON audit_logs(tenant_id, created_at DESC);
    `);

    // 5. Webhook delivery retry processing
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_webhook_delivery_tenant_retry
      ON webhook_deliveries(tenant_id, webhook_id, next_retry_at)
      WHERE status = 'PENDING';
    `);

    // === SINGLE COLUMN INDEXES ===

    // 6. User preference lookup by user
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_preference_user
      ON user_preferences(user_id);
    `);

    // 7. Active webhook lookup with partial index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_webhook_tenant_active
      ON webhooks(tenant_id, is_active)
      WHERE is_active = true;
    `);

    // 8. Active service package lookup
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_service_package_tenant_active
      ON service_packages(tenant_id, is_active)
      WHERE is_active = true;
    `);

    // 9. Active task type lookup
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_task_type_tenant_active
      ON task_types(tenant_id, is_active)
      WHERE is_active = true;
    `);

    // 10. Email template by tenant
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_email_template_tenant
      ON email_templates(tenant_id);
    `);

    // 11. Notification preference by tenant
    // Table might be missing in some envs, skipping to avoid failure
    // await queryRunner.query(`
    //   CREATE INDEX IF NOT EXISTS idx_notification_preference_tenant
    //   ON notification_preferences(tenant_id);
    // `);

    // === UNIQUE CONSTRAINTS (CRITICAL) ===

    // 12. Invoice unique constraint prevents duplicate invoices for same booking
    // This resolves the race condition in invoice creation
    await queryRunner.query(`
      ALTER TABLE invoices
      ADD CONSTRAINT uq_invoice_booking_tenant
      UNIQUE(booking_id, tenant_id);
    `);

    // === RECURRING TRANSACTION FAILURE TRACKING ===

    // 13. Add failure_count column if it doesn't exist
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'recurring_transactions' AND column_name = 'failure_count'
        ) THEN
          ALTER TABLE recurring_transactions ADD COLUMN failure_count INTEGER DEFAULT 0;
        END IF;
      END $$;
    `);

    // 14. Add last_error column if it doesn't exist
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'recurring_transactions' AND column_name = 'last_error'
        ) THEN
          ALTER TABLE recurring_transactions ADD COLUMN last_error TEXT;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop all created indexes and constraint in reverse order
    await queryRunner.query(
      `ALTER TABLE invoices DROP CONSTRAINT IF EXISTS uq_invoice_booking_tenant;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_notification_preference_tenant;`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_template_tenant;`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_task_type_tenant_active;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_service_package_tenant_active;`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_webhook_tenant_active;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_user_preference_user;`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_webhook_delivery_tenant_retry;`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_tenant_created;`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_transaction_tenant_type_date;`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_task_tenant_status_due;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_booking_tenant_created;`);

    // Remove failure tracking columns
    await queryRunner.query(`
      ALTER TABLE recurring_transactions DROP COLUMN IF EXISTS failure_count;
    `);
    await queryRunner.query(`
      ALTER TABLE recurring_transactions DROP COLUMN IF EXISTS last_error;
    `);
  }
}
