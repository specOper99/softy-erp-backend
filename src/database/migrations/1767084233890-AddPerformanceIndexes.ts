import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1767084233890 implements MigrationInterface {
  name = 'AddPerformanceIndexes1767084233890';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const constraintsToDrop = [
      ['employee_wallets', 'FK_employee_wallets_user'],
      ['profiles', 'FK_profiles_user'],
      ['package_items', 'FK_package_items_package'],
      ['package_items', 'FK_package_items_task_type'],
      ['bookings', 'FK_bookings_package'],
      ['tasks', 'FK_tasks_booking'],
      ['tasks', 'FK_tasks_task_type'],
      ['tasks', 'FK_tasks_user'],
      ['refresh_tokens', 'FK_refresh_tokens_user'],
      ['attachments', 'FK_attachments_booking'],
      ['attachments', 'FK_attachments_task'],
    ];

    for (const [table, constraint] of constraintsToDrop) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint}"`);
    }

    const indexesToDrop = [
      'idx_audit_logs_entity_date',
      'IDX_employee_wallets_tenant',
      'IDX_task_types_tenant',
      'IDX_package_items_tenant',
      'IDX_service_packages_tenant',
      'IDX_bookings_tenant',
      'idx_bookings_tenant_status',
      'IDX_tasks_tenant',
      'idx_tasks_booking',
      'idx_tasks_assigned_user',
      'idx_tasks_tenant_status',
      'IDX_users_email_tenant',
      'IDX_users_tenant',
      'IDX_refresh_tokens_hash',
      'idx_refresh_tokens_hash',
      'idx_refresh_tokens_user',
      'IDX_transactions_tenant',
      'idx_transactions_tenant_date',
      'idx_transactions_reference',
      'idx_attachments_booking',
      'idx_attachments_task',
    ];

    for (const index of indexesToDrop) {
      await queryRunner.query(`DROP INDEX IF EXISTS "public"."${index}"`);
    }

    // Drop and recreate tenant_id as character varying NOT NULL for all tables
    const tablesToUpdate = [
      'employee_wallets',
      'task_types',
      'package_items',
      'service_packages',
      'bookings',
      'tasks',
      'transactions',
    ];

    for (const table of tablesToUpdate) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "tenant_id"`);
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD "tenant_id" character varying NOT NULL DEFAULT 'test-tenant'`,
      );
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "tenant_id" DROP DEFAULT`);
    }

    // Special case for users (nullable)
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "tenant_id"`);
    await queryRunner.query(`ALTER TABLE "users" ADD "tenant_id" character varying`);

    await queryRunner.query(`ALTER TYPE "public"."bookings_status_enum" RENAME TO "bookings_status_enum_old"`);
    await queryRunner.query(
      `CREATE TYPE "public"."bookings_status_enum" AS ENUM('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(`ALTER TABLE "bookings" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "bookings" ALTER COLUMN "status" TYPE "public"."bookings_status_enum" USING "status"::"text"::"public"."bookings_status_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'DRAFT'`);
    await queryRunner.query(`DROP TYPE "public"."bookings_status_enum_old"`);

    await queryRunner.query(`ALTER TYPE "public"."tasks_status_enum" RENAME TO "tasks_status_enum_old"`);
    await queryRunner.query(`CREATE TYPE "public"."tasks_status_enum" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED')`);
    await queryRunner.query(`ALTER TABLE "tasks" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "tasks" ALTER COLUMN "status" TYPE "public"."tasks_status_enum" USING "status"::"text"::"public"."tasks_status_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
    await queryRunner.query(`DROP TYPE "public"."tasks_status_enum_old"`);

    await queryRunner.query(`CREATE INDEX "IDX_bd2726fd31b35443f2245b93ba" ON "audit_logs" ("user_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_85c204d8e47769ac183b32bf9c" ON "audit_logs" ("entity_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_5c06dc4ef5dde0151c0fbeaf0a" ON "employee_wallets" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_d57e22e16d8b0c32f51af9de8b" ON "task_types" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_f4db2b9ac32351c52741cbdd2f" ON "package_items" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_d013f113228dc39673239ba2a9" ON "service_packages" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_0c41823fa6a879a6aeba177465" ON "bookings" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_93edccfc42408754c4b5957105" ON "tasks" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_60aa850785e570c2181cd4d25e" ON "tasks" ("booking_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_ea76a982cfc3dd4bff34daaf03" ON "tasks" ("task_type_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_327d5ce9cd59770b274f8c3579" ON "tasks" ("assigned_user_id") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e9f4c2efab52114c4e99e28efb" ON "users" ("email", "tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_a7838d2ba25be1342091b6695f" ON "refresh_tokens" ("token_hash") `);
    await queryRunner.query(`CREATE INDEX "IDX_4f27188c6c1d993bc76aeddcde" ON "transactions" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_365b158cbdb7b7bc18bca4004a" ON "transactions" ("reference_id") `);
    await queryRunner.query(
      `ALTER TABLE "employee_wallets" ADD CONSTRAINT "FK_a5561fb92e47e5b1423c9a7878e" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD CONSTRAINT "FK_9e432b7df0d182f8d292902d1a2" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "package_items" ADD CONSTRAINT "FK_4af1566b499be54342efb0b96c1" FOREIGN KEY ("package_id") REFERENCES "service_packages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "package_items" ADD CONSTRAINT "FK_cd8a81bf2e0947c4bf53f9aac25" FOREIGN KEY ("task_type_id") REFERENCES "task_types"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_402873fd6596d556781ac5d8ae4" FOREIGN KEY ("package_id") REFERENCES "service_packages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_60aa850785e570c2181cd4d25e0" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_ea76a982cfc3dd4bff34daaf036" FOREIGN KEY ("task_type_id") REFERENCES "task_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_327d5ce9cd59770b274f8c3579f" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" ADD CONSTRAINT "FK_6883cc6070ab24d6a72dad5e7b0" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" ADD CONSTRAINT "FK_e62fd181b97caa6b150b09220b1" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attachments" DROP CONSTRAINT "FK_e62fd181b97caa6b150b09220b1"`);
    await queryRunner.query(`ALTER TABLE "attachments" DROP CONSTRAINT "FK_6883cc6070ab24d6a72dad5e7b0"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_327d5ce9cd59770b274f8c3579f"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_ea76a982cfc3dd4bff34daaf036"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_60aa850785e570c2181cd4d25e0"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_402873fd6596d556781ac5d8ae4"`);
    await queryRunner.query(`ALTER TABLE "package_items" DROP CONSTRAINT "FK_cd8a81bf2e0947c4bf53f9aac25"`);
    await queryRunner.query(`ALTER TABLE "package_items" DROP CONSTRAINT "FK_4af1566b499be54342efb0b96c1"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP CONSTRAINT "FK_9e432b7df0d182f8d292902d1a2"`);
    await queryRunner.query(`ALTER TABLE "employee_wallets" DROP CONSTRAINT "FK_a5561fb92e47e5b1423c9a7878e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_365b158cbdb7b7bc18bca4004a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4f27188c6c1d993bc76aeddcde"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a7838d2ba25be1342091b6695f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e9f4c2efab52114c4e99e28efb"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_327d5ce9cd59770b274f8c3579"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ea76a982cfc3dd4bff34daaf03"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_60aa850785e570c2181cd4d25e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_93edccfc42408754c4b5957105"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0c41823fa6a879a6aeba177465"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d013f113228dc39673239ba2a9"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f4db2b9ac32351c52741cbdd2f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d57e22e16d8b0c32f51af9de8b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5c06dc4ef5dde0151c0fbeaf0a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_85c204d8e47769ac183b32bf9c"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_bd2726fd31b35443f2245b93ba"`);

    const tablesToRevert = [
      'employee_wallets',
      'task_types',
      'package_items',
      'service_packages',
      'bookings',
      'tasks',
      'transactions',
    ];

    for (const table of tablesToRevert) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "tenant_id"`);
      // Revert to uuid since previous state was likely uuid based on existing logs
      await queryRunner.query(`ALTER TABLE "${table}" ADD "tenant_id" uuid`);
    }

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "tenant_id"`);
    await queryRunner.query(`ALTER TABLE "users" ADD "tenant_id" uuid`);

    await queryRunner.query(`ALTER TYPE "public"."tasks_status_enum" RENAME TO "tasks_status_enum_old"`);
    await queryRunner.query(
      `CREATE TYPE "public"."tasks_status_enum" AS ENUM('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(`ALTER TABLE "tasks" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "tasks" ALTER COLUMN "status" TYPE "public"."tasks_status_enum" USING "status"::"text"::"public"."tasks_status_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
    await queryRunner.query(`DROP TYPE "public"."tasks_status_enum_old"`);

    await queryRunner.query(`ALTER TYPE "public"."bookings_status_enum" RENAME TO "bookings_status_enum_old"`);
    await queryRunner.query(
      `CREATE TYPE "public"."bookings_status_enum" AS ENUM('DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(`ALTER TABLE "bookings" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "bookings" ALTER COLUMN "status" TYPE "public"."bookings_status_enum" USING "status"::"text"::"public"."bookings_status_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'DRAFT'`);
    await queryRunner.query(`DROP TYPE "public"."bookings_status_enum_old"`);

    await queryRunner.query(`CREATE INDEX "idx_audit_logs_entity_date" ON "audit_logs" ("entity_name", "created_at") `);
    await queryRunner.query(`CREATE INDEX "IDX_employee_wallets_tenant" ON "employee_wallets" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_task_types_tenant" ON "task_types" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_package_items_tenant" ON "package_items" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_service_packages_tenant" ON "service_packages" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_bookings_tenant" ON "bookings" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "idx_bookings_tenant_status" ON "bookings" ("tenant_id", "status") `);
    await queryRunner.query(`CREATE INDEX "IDX_tasks_tenant" ON "tasks" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "idx_tasks_booking" ON "tasks" ("booking_id") `);
    await queryRunner.query(`CREATE INDEX "idx_tasks_assigned_user" ON "tasks" ("assigned_user_id") `);
    await queryRunner.query(`CREATE INDEX "idx_tasks_tenant_status" ON "tasks" ("tenant_id", "status") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_users_email_tenant" ON "users" ("email", "tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_users_tenant" ON "users" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_hash" ON "refresh_tokens" ("token_hash") `);
    await queryRunner.query(`CREATE INDEX "idx_refresh_tokens_hash" ON "refresh_tokens" ("token_hash") `);
    await queryRunner.query(`CREATE INDEX "idx_refresh_tokens_user" ON "refresh_tokens" ("user_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_tenant" ON "transactions" ("tenant_id") `);
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_tenant_date" ON "transactions" ("tenant_id", "transaction_date") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_reference" ON "transactions" ("reference_id", "reference_type") `,
    );
    await queryRunner.query(`CREATE INDEX "idx_attachments_booking" ON "attachments" ("booking_id") `);
    await queryRunner.query(`CREATE INDEX "idx_attachments_task" ON "attachments" ("task_id") `);
  }
}
