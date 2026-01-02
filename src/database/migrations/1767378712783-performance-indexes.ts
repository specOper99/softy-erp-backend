import { MigrationInterface, QueryRunner } from 'typeorm';

export class PerformanceIndexes1767378712783 implements MigrationInterface {
  name = 'PerformanceIndexes1767378712783';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employee_wallets" DROP CONSTRAINT IF EXISTS "FK_wallet_user_composite"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "FK_profile_user_composite"`,
    );
    await queryRunner.query(
      `ALTER TABLE "package_items" DROP CONSTRAINT IF EXISTS "FK_item_package_composite"`,
    );
    await queryRunner.query(
      `ALTER TABLE "package_items" DROP CONSTRAINT IF EXISTS "FK_item_tasktype_composite"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "FK_booking_package_composite"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "FK_task_user_composite"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "FK_task_booking_composite"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "FK_task_tasktype_composite"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_audit_logs_tenant"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_employee_wallets_tenant_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_profiles_tenant"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_tasktype_composite_tenant"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_package_composite_tenant"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_booking_composite_tenant"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_task_composite_tenant"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_e9f4c2efab52114c4e99e28efb"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_user_composite_tenant"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_365b158cbdb7b7bc18bca4004a"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_attachments_tenant"`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "clients" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying NOT NULL, "email" character varying, "phone" character varying, "notes" text, CONSTRAINT "PK_f1ab7cf3a5714dbc6bb4e1c28a4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_e7d8b637725986e7b5fa774a3f" ON "clients" ("tenant_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_7b70ba8d3cc445c123cf0f280e" ON "clients" ("tenant_id", "id") `,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "payouts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "amount" numeric(12,2) NOT NULL, "payout_date" TIMESTAMP WITH TIME ZONE NOT NULL, "status" character varying NOT NULL DEFAULT 'COMPLETED', "notes" text, CONSTRAINT "PK_76855dc4f0a6c18c72eea302e87" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_f07854cfd9da774d04ba5dfbf7" ON "payouts" ("tenant_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_4a37d57cd4b1df2e4c3f3c3981" ON "payouts" ("tenant_id", "id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN IF EXISTS "client_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN IF EXISTS "client_phone"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN IF EXISTS "client_email"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN IF EXISTS "reference_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN IF EXISTS "reference_type"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."transactions_reference_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "client_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "booking_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "task_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "payout_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_wallets" DROP CONSTRAINT "FK_a5561fb92e47e5b1423c9a7878e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_wallets" ADD CONSTRAINT "UQ_a5561fb92e47e5b1423c9a7878e" UNIQUE ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_6f18d459490bb48923b1f40bdb" ON "audit_logs" ("tenant_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_89dff4a9ebb0f4ba95aa85348d" ON "employee_wallets" ("tenant_id", "user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_402873fd6596d556781ac5d8ae" ON "bookings" ("package_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_96bb2f14a3cd3f8e046898b08b" ON "users" ("id", "tenant_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_f1727abfbb0b1dfd42c357b8c3" ON "transactions" ("transaction_date") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_b36aa1f4e4a3684b302536d51e" ON "transactions" ("tenant_id", "transaction_date") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_53e6600ec819e27323c9744795" ON "transactions" ("tenant_id", "id") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_7058f2082c7a4ddc189ad7c9a8" ON "attachments" ("tenant_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "CHK_3c04c8c3a9eb587dc4119d404b" CHECK (("booking_id" IS NOT NULL AND "task_id" IS NULL AND "payout_id" IS NULL) OR ("booking_id" IS NULL AND "task_id" IS NOT NULL AND "payout_id" IS NULL) OR ("booking_id" IS NULL AND "task_id" IS NULL AND "payout_id" IS NOT NULL) OR ("booking_id" IS NULL AND "task_id" IS NULL AND "payout_id" IS NULL))`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_wallets" ADD CONSTRAINT "FK_a5561fb92e47e5b1423c9a7878e" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_23096dca2f7a9d1505d0267d4c6" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_fba75deb63bb89de7b5fc92746a" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_8ba1e2bd056b17468f5d8fe9f8f" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_06fcff0206fac682a8901303684" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_06fcff0206fac682a8901303684"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_8ba1e2bd056b17468f5d8fe9f8f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_fba75deb63bb89de7b5fc92746a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_23096dca2f7a9d1505d0267d4c6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_wallets" DROP CONSTRAINT "FK_a5561fb92e47e5b1423c9a7878e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "CHK_3c04c8c3a9eb587dc4119d404b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7058f2082c7a4ddc189ad7c9a8"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_53e6600ec819e27323c9744795"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b36aa1f4e4a3684b302536d51e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f1727abfbb0b1dfd42c357b8c3"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_96bb2f14a3cd3f8e046898b08b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_402873fd6596d556781ac5d8ae"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_89dff4a9ebb0f4ba95aa85348d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6f18d459490bb48923b1f40bdb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_wallets" DROP CONSTRAINT "UQ_a5561fb92e47e5b1423c9a7878e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_wallets" ADD CONSTRAINT "FK_a5561fb92e47e5b1423c9a7878e" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "payout_id"`,
    );
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "task_id"`);
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "booking_id"`,
    );
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "client_id"`);
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_reference_type_enum" AS ENUM('BOOKING', 'TASK', 'PAYROLL', 'OTHER')`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "reference_type" "public"."transactions_reference_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "reference_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "client_email" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "client_phone" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "client_name" character varying NOT NULL`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4a37d57cd4b1df2e4c3f3c3981"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f07854cfd9da774d04ba5dfbf7"`,
    );
    await queryRunner.query(`DROP TABLE "payouts"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7b70ba8d3cc445c123cf0f280e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e7d8b637725986e7b5fa774a3f"`,
    );
    await queryRunner.query(`DROP TABLE "clients"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_attachments_tenant" ON "attachments" ("tenant_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_365b158cbdb7b7bc18bca4004a" ON "transactions" ("reference_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_user_composite_tenant" ON "users" ("id", "tenant_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e9f4c2efab52114c4e99e28efb" ON "users" ("email", "tenant_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_task_composite_tenant" ON "tasks" ("id", "tenant_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_booking_composite_tenant" ON "bookings" ("id", "tenant_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_package_composite_tenant" ON "service_packages" ("id", "tenant_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_tasktype_composite_tenant" ON "task_types" ("id", "tenant_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_profiles_tenant" ON "profiles" ("tenant_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_employee_wallets_tenant_user" ON "employee_wallets" ("user_id", "tenant_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_tenant" ON "audit_logs" ("tenant_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_task_tasktype_composite" FOREIGN KEY ("task_type_id", "tenant_id") REFERENCES "task_types"("id","tenant_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_task_booking_composite" FOREIGN KEY ("booking_id", "tenant_id") REFERENCES "bookings"("id","tenant_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_task_user_composite" FOREIGN KEY ("assigned_user_id", "tenant_id") REFERENCES "users"("id","tenant_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_booking_package_composite" FOREIGN KEY ("package_id", "tenant_id") REFERENCES "service_packages"("id","tenant_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "package_items" ADD CONSTRAINT "FK_item_tasktype_composite" FOREIGN KEY ("task_type_id", "tenant_id") REFERENCES "task_types"("id","tenant_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "package_items" ADD CONSTRAINT "FK_item_package_composite" FOREIGN KEY ("package_id", "tenant_id") REFERENCES "service_packages"("id","tenant_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD CONSTRAINT "FK_profile_user_composite" FOREIGN KEY ("user_id", "tenant_id") REFERENCES "users"("id","tenant_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_wallets" ADD CONSTRAINT "FK_wallet_user_composite" FOREIGN KEY ("user_id", "tenant_id") REFERENCES "users"("id","tenant_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
