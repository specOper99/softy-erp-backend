import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhase3Indexes1767700000000 implements MigrationInterface {
  name = 'AddPhase3Indexes1767700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Clients indexes for search
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_clients_tenant_email" 
      ON "clients" ("tenant_id", "email")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_clients_tenant_phone" 
      ON "clients" ("tenant_id", "phone")
    `);

    // Profiles index for hire date filtering (HR reports)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_profiles_tenant_hire_date" 
      ON "profiles" ("tenant_id", "hire_date")
    `);

    // Service packages partial index for active packages (catalog queries)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_packages_tenant_active" 
      ON "service_packages" ("tenant_id", "is_active")
      WHERE "is_active" = true
    `);

    // Refresh tokens partial index for expiry checks (auth cleanup)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_expires_at" 
      ON "refresh_tokens" ("expires_at")
      WHERE "is_revoked" = false
    `);

    // Tasks index for due date filtering (task management)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_tenant_due_date" 
      ON "tasks" ("tenant_id", "due_date")
    `);

    // Transactions category index (financial reports by category)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_transactions_tenant_category" 
      ON "transactions" ("tenant_id", "category")
    `);

    // Bookings client index (client lookup on bookings)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_bookings_tenant_client" 
      ON "bookings" ("tenant_id", "client_id")
    `);

    // Wallets partial index for payable balance (payroll processing)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_wallets_tenant_payable" 
      ON "employee_wallets" ("tenant_id", "payable_balance")
      WHERE "payable_balance" > 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_clients_tenant_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_clients_tenant_phone"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_profiles_tenant_hire_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_packages_tenant_active"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_refresh_tokens_expires_at"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tasks_tenant_due_date"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_transactions_tenant_category"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_bookings_tenant_client"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_wallets_tenant_payable"`,
    );
  }
}
