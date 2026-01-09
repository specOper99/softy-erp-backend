import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingIndexes1767800000004 implements MigrationInterface {
  name = 'AddMissingIndexes1767800000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_bookings_event_date" ON "bookings" ("tenant_id", "event_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_bookings_client_id" ON "bookings" ("tenant_id", "client_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_tasks_assigned_user_id" ON "tasks" ("tenant_id", "assigned_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_tasks_status" ON "tasks" ("tenant_id", "status")`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_transactions_booking_id" ON "transactions" ("tenant_id", "booking_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_transactions_category" ON "transactions" ("tenant_id", "category")`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_wallets_payable_balance" ON "employee_wallets" ("tenant_id", "payable_balance") WHERE payable_balance > 0`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_profiles_hire_date" ON "profiles" ("tenant_id", "hire_date")`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_clients_email" ON "clients" ("tenant_id", "email")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_clients_phone" ON "clients" ("tenant_id", "phone")`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_packages_active" ON "service_packages" ("tenant_id", "is_active") WHERE is_active = true`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_expires_at" ON "refresh_tokens" ("expires_at") WHERE is_revoked = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_refresh_tokens_expires_at"`);
    await queryRunner.query(`DROP INDEX "idx_packages_active"`);
    await queryRunner.query(`DROP INDEX "idx_clients_phone"`);
    await queryRunner.query(`DROP INDEX "idx_clients_email"`);
    await queryRunner.query(`DROP INDEX "idx_profiles_hire_date"`);
    await queryRunner.query(`DROP INDEX "idx_wallets_payable_balance"`);
    await queryRunner.query(`DROP INDEX "idx_transactions_category"`);
    await queryRunner.query(`DROP INDEX "idx_transactions_booking_id"`);
    await queryRunner.query(`DROP INDEX "idx_tasks_status"`);
    await queryRunner.query(`DROP INDEX "idx_tasks_assigned_user_id"`);
    await queryRunner.query(`DROP INDEX "idx_bookings_client_id"`);
    await queryRunner.query(`DROP INDEX "idx_bookings_event_date"`);
  }
}
