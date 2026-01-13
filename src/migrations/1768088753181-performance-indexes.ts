import { MigrationInterface, QueryRunner } from 'typeorm';

export class PerformanceIndexes1768088753181 implements MigrationInterface {
  name = 'PerformanceIndexes1768088753181';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying, "tenant_id" uuid, "action" character varying NOT NULL, "entity_name" character varying NOT NULL, "entity_id" character varying NOT NULL, "old_values" jsonb, "new_values" jsonb, "notes" text, "ip_address" character varying, "user_agent" character varying, "method" character varying, "path" character varying, "status_code" integer, "duration_ms" integer, "hash" character varying(64), "previous_hash" character varying(64), "sequence_number" bigint, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6498a43d96b79fb3e6091d4fcb7" PRIMARY KEY ("id", "created_at"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_bd2726fd31b35443f2245b93ba" ON "audit_logs" ("user_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_6f18d459490bb48923b1f40bdb" ON "audit_logs" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_85c204d8e47769ac183b32bf9c" ON "audit_logs" ("entity_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_67c4ff6334797c722a15eec21f" ON "audit_logs" ("hash") `);
    await queryRunner.query(
      `CREATE TABLE "employee_wallets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "user_id" uuid NOT NULL, "pending_balance" numeric(12,2) NOT NULL DEFAULT '0', "payable_balance" numeric(12,2) NOT NULL DEFAULT '0', CONSTRAINT "REL_a5561fb92e47e5b1423c9a7878" UNIQUE ("user_id"), CONSTRAINT "PK_f8e3975e13925cfe0d28b96dcf4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_5c06dc4ef5dde0151c0fbeaf0a" ON "employee_wallets" ("tenant_id") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_89dff4a9ebb0f4ba95aa85348d" ON "employee_wallets" ("tenant_id", "user_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."profiles_contract_type_enum" AS ENUM('FULL_TIME', 'PART_TIME', 'FREELANCE', 'INTERN', 'CONTRACTOR')`,
    );
    await queryRunner.query(
      `CREATE TABLE "profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "user_id" uuid NOT NULL, "first_name" character varying, "last_name" character varying, "job_title" character varying, "base_salary" numeric(12,2) NOT NULL DEFAULT '0', "hire_date" date, "bank_account" character varying, "phone" character varying, "emergency_contact_name" character varying, "emergency_contact_phone" character varying, "address" character varying, "city" character varying, "country" character varying, "department" character varying, "team" character varying, "contract_type" "public"."profiles_contract_type_enum" NOT NULL DEFAULT 'FULL_TIME', "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_9e432b7df0d182f8d292902d1a2" UNIQUE ("user_id"), CONSTRAINT "REL_9e432b7df0d182f8d292902d1a" UNIQUE ("user_id"), CONSTRAINT "PK_8e520eb4da7dc01d0e190447c8e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_b3cf4b94987d3b77e9242af37e" ON "profiles" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_414e162a13c062cababc0550a1" ON "profiles" ("tenant_id", "team") `);
    await queryRunner.query(`CREATE INDEX "IDX_bb3a22ba6c6985c30ca3edc47b" ON "profiles" ("tenant_id", "department") `);
    await queryRunner.query(
      `CREATE TABLE "task_types" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "name" character varying NOT NULL, "description" text, "default_commission_amount" numeric(12,2) NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_232576669c4df1f0a15e1300ce2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_d57e22e16d8b0c32f51af9de8b" ON "task_types" ("tenant_id") `);
    await queryRunner.query(
      `CREATE TABLE "package_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "package_id" uuid NOT NULL, "task_type_id" uuid NOT NULL, "quantity" integer NOT NULL DEFAULT '1', CONSTRAINT "PK_fc988c399ff9473e2baebbd16ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_f4db2b9ac32351c52741cbdd2f" ON "package_items" ("tenant_id") `);
    await queryRunner.query(
      `CREATE TABLE "service_packages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "name" character varying NOT NULL, "description" text, "price" numeric(12,2) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "is_template" boolean NOT NULL DEFAULT false, "template_category" character varying, CONSTRAINT "PK_d602a30f23af1a0ecf7c8e994df" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_d013f113228dc39673239ba2a9" ON "service_packages" ("tenant_id") `);
    await queryRunner.query(
      `CREATE TABLE "clients" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "name" character varying NOT NULL, "email" character varying, "phone" character varying, "notes" text, "tags" jsonb DEFAULT '[]', "access_token_hash" character varying(64), "accessTokenExpiry" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_f1ab7cf3a5714dbc6bb4e1c28a4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_e7d8b637725986e7b5fa774a3f" ON "clients" ("tenant_id") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_84e812b6defb372516be517413" ON "clients" ("tenant_id", "access_token_hash") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_b8cb5e0d968c9498a3295183f3" ON "clients" ("tenant_id", "phone") `);
    await queryRunner.query(`CREATE INDEX "IDX_64c382ca195306f588c79055c7" ON "clients" ("tenant_id", "email") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_7b70ba8d3cc445c123cf0f280e" ON "clients" ("tenant_id", "id") `);
    await queryRunner.query(
      `CREATE TYPE "public"."invoices_status_enum" AS ENUM('DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED', 'VOID')`,
    );
    await queryRunner.query(
      `CREATE TABLE "invoices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "invoice_number" character varying NOT NULL, "booking_id" uuid, "client_id" uuid NOT NULL, "status" "public"."invoices_status_enum" NOT NULL DEFAULT 'DRAFT', "issue_date" TIMESTAMP WITH TIME ZONE NOT NULL, "due_date" TIMESTAMP WITH TIME ZONE NOT NULL, "paid_date" TIMESTAMP WITH TIME ZONE, "items" jsonb NOT NULL DEFAULT '[]', "sub_total" numeric(12,2) NOT NULL DEFAULT '0', "tax_rate" numeric(5,2) NOT NULL DEFAULT '0', "tax_total" numeric(12,2) NOT NULL DEFAULT '0', "total_amount" numeric(12,2) NOT NULL DEFAULT '0', "amount_paid" numeric(12,2) NOT NULL DEFAULT '0', "balance_due" numeric(12,2) NOT NULL DEFAULT '0', "pdf_url" character varying, "currency" character varying(3) NOT NULL DEFAULT 'USD', "notes" text, "sent_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "REL_ed9c7aa7846704bbcb648377e8" UNIQUE ("booking_id"), CONSTRAINT "PK_668cef7c22a427fd822cc1be3ce" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_440f531f452dcc4389d201b9d4" ON "invoices" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_545e976a52406b41671c3c11b1" ON "invoices" ("tenant_id", "client_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_344c231fafffe51efbd3f17e6d" ON "invoices" ("tenant_id", "due_date") `);
    await queryRunner.query(`CREATE INDEX "IDX_c7c70191c624dc41d7cbafdc10" ON "invoices" ("tenant_id", "status") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ca69be6052c5b4fb34e19a4437" ON "invoices" ("tenant_id", "booking_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2d3ced63b2eb8ae2407b1d3493" ON "invoices" ("tenant_id", "invoice_number") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bookings_status_enum" AS ENUM('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bookings_payment_status_enum" AS ENUM('UNPAID', 'DEPOSIT_PAID', 'PARTIALLY_PAID', 'FULLY_PAID')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bookings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "client_id" uuid NOT NULL, "event_date" TIMESTAMP WITH TIME ZONE NOT NULL, "status" "public"."bookings_status_enum" NOT NULL DEFAULT 'DRAFT', "total_price" numeric(12,2) NOT NULL, "sub_total" numeric(12,2) NOT NULL DEFAULT '0', "tax_rate" numeric(5,2) NOT NULL DEFAULT '0', "tax_amount" numeric(12,2) NOT NULL DEFAULT '0', "package_id" uuid NOT NULL, "deposit_percentage" numeric(5,2) NOT NULL DEFAULT '0', "deposit_amount" numeric(12,2) NOT NULL DEFAULT '0', "amount_paid" numeric(12,2) NOT NULL DEFAULT '0', "payment_status" "public"."bookings_payment_status_enum" NOT NULL DEFAULT 'UNPAID', "notes" text, "cancelled_at" TIMESTAMP WITH TIME ZONE, "refund_amount" numeric(12,2) NOT NULL DEFAULT '0', "cancellation_reason" text, "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_bee6805982cc1e248e94ce94957" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_0c41823fa6a879a6aeba177465" ON "bookings" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_23096dca2f7a9d1505d0267d4c" ON "bookings" ("client_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_402873fd6596d556781ac5d8ae" ON "bookings" ("package_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_40ea7a6141b2fde9058ff2837c" ON "bookings" ("tenant_id", "created_at") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_b678e8df5cba244396c89d6b64" ON "bookings" ("tenant_id", "client_id", "event_date") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_716b6b4e89bad3466d007b81d7" ON "bookings" ("tenant_id", "status", "event_date") `,
    );
    await queryRunner.query(`CREATE TYPE "public"."tasks_status_enum" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED')`);
    await queryRunner.query(
      `CREATE TABLE "tasks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "booking_id" uuid NOT NULL, "task_type_id" uuid NOT NULL, "assigned_user_id" uuid, "parent_id" uuid, "status" "public"."tasks_status_enum" NOT NULL DEFAULT 'PENDING', "commission_snapshot" numeric(12,2) NOT NULL DEFAULT '0', "due_date" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "notes" text, "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_8d12ff38fcc62aaba2cab748772" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_93edccfc42408754c4b5957105" ON "tasks" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_60aa850785e570c2181cd4d25e" ON "tasks" ("booking_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_ea76a982cfc3dd4bff34daaf03" ON "tasks" ("task_type_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_327d5ce9cd59770b274f8c3579" ON "tasks" ("assigned_user_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_b03c99063a4eaf084f069a4d5a" ON "tasks" ("parent_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_20d090a7b83189b4cddb3e3d0e" ON "tasks" ("tenant_id", "created_at") `);
    await queryRunner.query(`CREATE INDEX "IDX_abb18e7a1300f18a66253a00e8" ON "tasks" ("tenant_id", "deleted_at") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_1e82eb99ade0bbd12cba554ed4" ON "tasks" ("tenant_id", "status", "due_date") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('ADMIN', 'OPS_MANAGER', 'FIELD_STAFF', 'CLIENT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "tenant_id" uuid NOT NULL, "password_hash" character varying NOT NULL, "mfa_secret" character varying, "is_mfa_enabled" boolean NOT NULL DEFAULT false, "mfa_recovery_codes" json, "role" "public"."users_role_enum" NOT NULL DEFAULT 'FIELD_STAFF', "is_active" boolean NOT NULL DEFAULT true, "email_verified" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_96bb2f14a3cd3f8e046898b08b" ON "users" ("id", "tenant_id") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "token_hash" character varying NOT NULL, "user_id" uuid NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "is_revoked" boolean NOT NULL DEFAULT false, "user_agent" character varying(512), "ip_address" character varying(45), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_used_at" TIMESTAMP WITH TIME ZONE, "device_name" character varying, "location" character varying, "last_ip_address" character varying(45), "ip_changed" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_a7838d2ba25be1342091b6695f1" UNIQUE ("token_hash"), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_a7838d2ba25be1342091b6695f" ON "refresh_tokens" ("token_hash") `);
    await queryRunner.query(
      `CREATE TYPE "public"."transaction_categories_applicabletype_enum" AS ENUM('INCOME', 'EXPENSE', 'PAYROLL')`,
    );
    await queryRunner.query(
      `CREATE TABLE "transaction_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "name" character varying NOT NULL, "description" text, "applicableType" "public"."transaction_categories_applicabletype_enum", "is_active" boolean NOT NULL DEFAULT true, "parent_id" uuid, CONSTRAINT "PK_bbd38b9174546b0ed4fe04689c7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_a9c93bbc847b97e2d84d5aebfa" ON "transaction_categories" ("tenant_id") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_27840c32ef0173a3dc3a537a89" ON "transaction_categories" ("tenant_id", "name") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_01e19ef89d1023edf0353d89d2" ON "transaction_categories" ("tenant_id", "id") `,
    );
    await queryRunner.query(`CREATE TYPE "public"."transactions_type_enum" AS ENUM('INCOME', 'EXPENSE', 'PAYROLL')`);
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_currency_enum" AS ENUM('USD', 'EUR', 'GBP', 'AED', 'SAR')`,
    );
    await queryRunner.query(
      `CREATE TABLE "transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "type" "public"."transactions_type_enum" NOT NULL, "currency" "public"."transactions_currency_enum" NOT NULL DEFAULT 'USD', "exchange_rate" numeric(12,6) NOT NULL DEFAULT '1', "amount" numeric(12,2) NOT NULL, "category" character varying, "category_id" uuid, "department" character varying, "booking_id" uuid, "task_id" uuid, "payout_id" uuid, "description" text, "transaction_date" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "CHK_22de4ae7fa123b1fc2bf508651" CHECK (("booking_id" IS NOT NULL AND "task_id" IS NULL AND "payout_id" IS NULL) OR ("booking_id" IS NULL AND "task_id" IS NOT NULL AND "payout_id" IS NULL) OR ("booking_id" IS NULL AND "task_id" IS NULL AND "payout_id" IS NOT NULL)), CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_4f27188c6c1d993bc76aeddcde" ON "transactions" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_3906d00f6a4cd10bd8acef9ca0" ON "transactions" ("department") `);
    await queryRunner.query(`CREATE INDEX "IDX_f1727abfbb0b1dfd42c357b8c3" ON "transactions" ("transaction_date") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_e34fe53feb631ff94ab316a707" ON "transactions" ("tenant_id", "department") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b36aa1f4e4a3684b302536d51e" ON "transactions" ("tenant_id", "transaction_date") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_53e6600ec819e27323c9744795" ON "transactions" ("tenant_id", "id") `,
    );
    await queryRunner.query(`CREATE TYPE "public"."payouts_currency_enum" AS ENUM('USD', 'EUR', 'GBP', 'AED', 'SAR')`);
    await queryRunner.query(
      `CREATE TABLE "payouts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "amount" numeric(12,2) NOT NULL, "payout_date" TIMESTAMP WITH TIME ZONE NOT NULL, "status" character varying NOT NULL DEFAULT 'COMPLETED', "currency" "public"."payouts_currency_enum" NOT NULL DEFAULT 'USD', "notes" text, CONSTRAINT "PK_76855dc4f0a6c18c72eea302e87" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_f07854cfd9da774d04ba5dfbf7" ON "payouts" ("tenant_id") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_4a37d57cd4b1df2e4c3f3c3981" ON "payouts" ("tenant_id", "id") `);
    await queryRunner.query(
      `CREATE TYPE "public"."recurring_transactions_type_enum" AS ENUM('INCOME', 'EXPENSE', 'PAYROLL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."recurring_transactions_currency_enum" AS ENUM('USD', 'EUR', 'GBP', 'AED', 'SAR')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."recurring_transactions_frequency_enum" AS ENUM('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."recurring_transactions_status_enum" AS ENUM('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "recurring_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "name" character varying NOT NULL, "type" "public"."recurring_transactions_type_enum" NOT NULL, "amount" numeric(12,2) NOT NULL, "currency" "public"."recurring_transactions_currency_enum" NOT NULL DEFAULT 'USD', "category" character varying, "department" character varying, "description" text, "frequency" "public"."recurring_transactions_frequency_enum" NOT NULL, "interval" integer NOT NULL DEFAULT '1', "start_date" date NOT NULL, "end_date" date, "next_run_date" date NOT NULL, "last_run_date" date, "run_count" integer NOT NULL DEFAULT '0', "max_occurrences" integer, "status" "public"."recurring_transactions_status_enum" NOT NULL DEFAULT 'ACTIVE', "notify_before_days" integer NOT NULL DEFAULT '0', "failure_count" integer NOT NULL DEFAULT '0', "last_error" text, CONSTRAINT "PK_6485db3243762a54992dc0ce3b7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_7cfe3fe293be3c1ea331ad52e2" ON "recurring_transactions" ("tenant_id") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_e6ed024c6f398afadfb9cbff82" ON "recurring_transactions" ("tenant_id", "next_run_date") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9a6f00c87b582e7bbfd6e6f2ed" ON "recurring_transactions" ("tenant_id", "status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b432cb72bfeb547a809e75fbd6" ON "recurring_transactions" ("tenant_id", "id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "payroll_runs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "total_employees" integer NOT NULL, "total_payout" numeric(12,2) NOT NULL, "processed_at" TIMESTAMP WITH TIME ZONE NOT NULL, "status" character varying NOT NULL DEFAULT 'COMPLETED', "transaction_ids" jsonb, "notes" text, CONSTRAINT "PK_6049f42c972640c0eb99ba8035e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_90dca85e9c4fbf1363e6732386" ON "payroll_runs" ("tenant_id") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7b96dc34990c9c3462f604ec89" ON "payroll_runs" ("tenant_id", "id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "email_templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "name" character varying NOT NULL, "subject" character varying NOT NULL, "content" text NOT NULL, "variables" jsonb NOT NULL DEFAULT '[]', "isSystem" boolean NOT NULL DEFAULT false, "description" character varying, CONSTRAINT "PK_06c564c515d8cdb40b6f3bfbbb4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_2982dc30aa931f4db2ff53c648" ON "email_templates" ("tenant_id") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_15e34a853fee57b67fb3ac4d52" ON "email_templates" ("tenant_id", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "attachments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "name" character varying NOT NULL, "url" character varying NOT NULL, "mime_type" character varying NOT NULL, "size" integer NOT NULL, "booking_id" uuid, "task_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5e1f050bcff31e3084a1d662412" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_7058f2082c7a4ddc189ad7c9a8" ON "attachments" ("tenant_id") `);
    await queryRunner.query(
      `CREATE TYPE "public"."notification_preferences_notification_type_enum" AS ENUM('BOOKING_CREATED', 'BOOKING_UPDATED', 'BOOKING_CANCELLED', 'TASK_ASSIGNED', 'TASK_COMPLETED', 'PAYMENT_RECEIVED', 'SYSTEM_ALERT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_preferences_frequency_enum" AS ENUM('IMMEDIATE', 'DAILY_DIGEST', 'NONE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notification_preferences" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "notification_type" "public"."notification_preferences_notification_type_enum" NOT NULL, "email_enabled" boolean NOT NULL DEFAULT true, "in_app_enabled" boolean NOT NULL DEFAULT true, "frequency" "public"."notification_preferences_frequency_enum" NOT NULL DEFAULT 'IMMEDIATE', CONSTRAINT "UQ_f22207503ea3210d2c18182cd4f" UNIQUE ("user_id", "notification_type"), CONSTRAINT "PK_e94e2b543f2f218ee68e4f4fad2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."consents_type_enum" AS ENUM('TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'MARKETING_EMAILS', 'DATA_PROCESSING', 'ANALYTICS', 'THIRD_PARTY_SHARING')`,
    );
    await queryRunner.query(
      `CREATE TABLE "consents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "user_id" uuid NOT NULL, "type" "public"."consents_type_enum" NOT NULL, "granted" boolean NOT NULL DEFAULT false, "granted_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "policy_version" character varying, "ip_address" character varying, "user_agent" character varying, CONSTRAINT "PK_9efc68eb6aba7d638fb6ea034dd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_949e8b074f10fe283dc754bfb8" ON "consents" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_f26200736ecd618cff7dc32365" ON "consents" ("tenant_id", "type") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_10fd6e488c564af9d71cc3376b" ON "consents" ("tenant_id", "user_id", "type") `,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a8c683641d0c849c9ba682709e" ON "consents" ("tenant_id", "id") `);
    await queryRunner.query(`CREATE TYPE "public"."time_entries_status_enum" AS ENUM('RUNNING', 'STOPPED')`);
    await queryRunner.query(
      `CREATE TABLE "time_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "task_id" uuid NOT NULL, "user_id" uuid NOT NULL, "start_time" TIMESTAMP WITH TIME ZONE NOT NULL, "end_time" TIMESTAMP WITH TIME ZONE, "duration_minutes" integer, "notes" text, "status" "public"."time_entries_status_enum" NOT NULL DEFAULT 'RUNNING', "billable" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_b8bc5f10269ba2fe88708904aa0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_794b624ef3b3b9b07bf3cb3d65" ON "time_entries" ("tenant_id") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_1a468af552a0c98d521a271722" ON "time_entries" ("tenant_id", "start_time") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_76262f9e80f47de12c3dfa9a89" ON "time_entries" ("tenant_id", "user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_93ab8d9d6d5ac5798f4b7d01a1" ON "time_entries" ("tenant_id", "task_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b69921d81fb005fbcfdd7967ca" ON "time_entries" ("tenant_id", "id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tenants_subscriptionplan_enum" AS ENUM('FREE', 'PRO', 'ENTERPRISE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tenants_base_currency_enum" AS ENUM('USD', 'EUR', 'GBP', 'AED', 'SAR')`,
    );
    await queryRunner.query(`CREATE TYPE "public"."tenants_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED')`);
    await queryRunner.query(
      `CREATE TABLE "tenants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "slug" character varying NOT NULL, "subscriptionPlan" "public"."tenants_subscriptionplan_enum" NOT NULL DEFAULT 'FREE', "base_currency" "public"."tenants_base_currency_enum" NOT NULL DEFAULT 'USD', "status" "public"."tenants_status_enum" NOT NULL DEFAULT 'ACTIVE', "default_tax_rate" numeric(5,2) NOT NULL DEFAULT '15', "cancellation_policy_days" jsonb NOT NULL DEFAULT '[{"daysBeforeEvent": 7, "refundPercentage": 100}, {"daysBeforeEvent": 0, "refundPercentage": 0}]', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "quotas" jsonb NOT NULL DEFAULT '{}', "parent_tenant_id" uuid, CONSTRAINT "UQ_2310ecc5cb8be427097154b18fc" UNIQUE ("slug"), CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id")); COMMENT ON COLUMN "tenants"."quotas" IS 'Resource quotas (e.g. max_users: 10, max_storage_gb: 5)'`,
    );
    await queryRunner.query(
      `CREATE TABLE "daily_metrics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "date" date NOT NULL, "totalRevenue" numeric(12,2) NOT NULL DEFAULT '0', "bookingsCount" integer NOT NULL DEFAULT '0', "tasksCompletedCount" integer NOT NULL DEFAULT '0', "activeClientsCount" integer NOT NULL DEFAULT '0', "cancellationsCount" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0b33a3faffa5fbb3d4dad78c4e9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d3ec81cabc3c03a9f92b7a37f7" ON "daily_metrics" ("tenantId", "date") `,
    );
    await queryRunner.query(
      `CREATE TABLE "email_verification_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "token_hash" character varying NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_417a095bbed21c2369a6a01ab9a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c20ed35f3d31d486aabcd0564d" ON "email_verification_tokens" ("token_hash") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_973ceb9e119e69f5b42fbfa44a" ON "email_verification_tokens" ("email") `);
    await queryRunner.query(
      `CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "token_hash" character varying NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_91185d86d5d7557b19abbb2868" ON "password_reset_tokens" ("token_hash") `);
    await queryRunner.query(`CREATE INDEX "IDX_2ecfa961f2f3e33fff8e19b6c7" ON "password_reset_tokens" ("email") `);
    await queryRunner.query(
      `CREATE TABLE "billing_customers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "stripe_customer_id" text NOT NULL, "email" text, "name" text, "default_payment_method_id" text, "address" jsonb, "tax_exempt" boolean NOT NULL DEFAULT false, "invoice_prefix" text, "metadata" jsonb, CONSTRAINT "REL_2abf97465a7ce3cf6e18a8508e" UNIQUE ("tenant_id"), CONSTRAINT "PK_33443c37051e342361f61a54b86" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8236710a5135642b2311310209" ON "billing_customers" ("stripe_customer_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2abf97465a7ce3cf6e18a8508e" ON "billing_customers" ("tenant_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payment_methods_type_enum" AS ENUM('CARD', 'BANK_ACCOUNT', 'SEPA_DEBIT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_methods" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "stripe_payment_method_id" text NOT NULL, "type" "public"."payment_methods_type_enum" NOT NULL DEFAULT 'CARD', "brand" text, "last_four" character varying(4), "exp_month" integer, "exp_year" integer, "is_default" boolean NOT NULL DEFAULT false, "billingDetails" jsonb, CONSTRAINT "PK_34f9b8c6dfb4ac3559f7e2820d1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1f03501f788e64bf699d206fa5" ON "payment_methods" ("stripe_payment_method_id") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_e65eddc13f0cb1694ce740dc6b" ON "payment_methods" ("tenant_id") `);
    await queryRunner.query(
      `CREATE TYPE "public"."subscriptions_status_enum" AS ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'PAUSED')`,
    );
    await queryRunner.query(`CREATE TYPE "public"."subscriptions_billing_interval_enum" AS ENUM('MONTH', 'YEAR')`);
    await queryRunner.query(
      `CREATE TABLE "subscriptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "stripe_subscription_id" character varying NOT NULL, "stripe_customer_id" character varying NOT NULL, "stripe_price_id" character varying NOT NULL, "status" "public"."subscriptions_status_enum" NOT NULL DEFAULT 'INCOMPLETE', "billing_interval" "public"."subscriptions_billing_interval_enum" NOT NULL DEFAULT 'MONTH', "current_period_start" TIMESTAMP WITH TIME ZONE NOT NULL, "current_period_end" TIMESTAMP WITH TIME ZONE NOT NULL, "cancel_at_period_end" boolean NOT NULL DEFAULT false, "canceled_at" TIMESTAMP WITH TIME ZONE, "trial_start" TIMESTAMP WITH TIME ZONE, "trial_end" TIMESTAMP WITH TIME ZONE, "quantity" integer NOT NULL DEFAULT '0', "metadata" jsonb, CONSTRAINT "PK_a87248d73155605cf782be9ee5e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3a2d09d943f39912a01831a927" ON "subscriptions" ("stripe_subscription_id") `,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f6ac03431c311ccb8bbd7d3af1" ON "subscriptions" ("tenant_id") `);
    await queryRunner.query(
      `CREATE TYPE "public"."usage_records_metric_enum" AS ENUM('USERS', 'BOOKINGS', 'STORAGE_GB', 'API_CALLS')`,
    );
    await queryRunner.query(
      `CREATE TABLE "usage_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "subscription_id" text, "metric" "public"."usage_records_metric_enum" NOT NULL, "quantity" integer NOT NULL, "period_start" TIMESTAMP WITH TIME ZONE NOT NULL, "period_end" TIMESTAMP WITH TIME ZONE NOT NULL, "reported_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), "stripe_usage_record_id" text, "metadata" jsonb, CONSTRAINT "PK_e511cf9f7dc53851569f87467a5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_af049b5733533a8c0dc0704cb9" ON "usage_records" ("tenant_id", "reported_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8344625d2464d332185030902f" ON "usage_records" ("tenant_id", "metric", "period_start") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_preferences" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "dashboardConfig" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "REL_458057fa75b66e68a275647da2" UNIQUE ("user_id"), CONSTRAINT "PK_e8cfb5b31af61cd363a6b6d7c25" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "department_budgets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "department" character varying NOT NULL, "budget_amount" numeric(12,2) NOT NULL DEFAULT '0', "period" character varying NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "notes" text, CONSTRAINT "PK_1ad00852db9edbb65973d27e26a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_997f872384513653afac31a9c4" ON "department_budgets" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_374a79c5eaafd0c0bfe57012aa" ON "department_budgets" ("period") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_472772835d7d3d90af3bbb413f" ON "department_budgets" ("tenant_id", "department", "period") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."attendance_status_enum" AS ENUM('PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY', 'REMOTE', 'SICK')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."attendance_leave_type_enum" AS ENUM('ANNUAL', 'SICK', 'PERSONAL', 'UNPAID', 'MATERNITY', 'PATERNITY')`,
    );
    await queryRunner.query(
      `CREATE TABLE "attendance" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "user_id" uuid NOT NULL, "date" date NOT NULL, "check_in" TIMESTAMP WITH TIME ZONE, "check_out" TIMESTAMP WITH TIME ZONE, "status" "public"."attendance_status_enum" NOT NULL DEFAULT 'PRESENT', "leave_type" "public"."attendance_leave_type_enum", "worked_hours" numeric(5,2), "notes" text, "approved_by" uuid, "approved_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_ee0ffe42c1f1a01e72b725c0cb2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_c2f7fba0ddece3c4eabbaceb2e" ON "attendance" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_effb98e9f2cc1879e1f088fda8" ON "attendance" ("tenant_id", "date") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e1ceb697cdea2c117d6818fcea" ON "attendance" ("tenant_id", "user_id", "date") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_190318399b1c34afe329de7b11" ON "attendance" ("tenant_id", "id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."performance_reviews_period_type_enum" AS ENUM('QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'PROBATION', 'AD_HOC')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."performance_reviews_status_enum" AS ENUM('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'COMPLETED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "performance_reviews" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "user_id" uuid NOT NULL, "reviewer_id" uuid NOT NULL, "period_type" "public"."performance_reviews_period_type_enum" NOT NULL DEFAULT 'QUARTERLY', "period_start" date NOT NULL, "period_end" date NOT NULL, "status" "public"."performance_reviews_status_enum" NOT NULL DEFAULT 'DRAFT', "overall_rating" integer, "strengths" jsonb DEFAULT '[]', "areas_for_improvement" jsonb DEFAULT '[]', "goals" jsonb DEFAULT '[]', "reviewer_comments" text, "employee_comments" text, "submitted_at" TIMESTAMP WITH TIME ZONE, "acknowledged_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_46f39f620497eb3de4fe6dafdef" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_b9a0441863f21815d352c42b77" ON "performance_reviews" ("tenant_id") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_7f6176b1ae7f1478d109219458" ON "performance_reviews" ("tenant_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_87baa58d173e0aafdc71340282" ON "performance_reviews" ("tenant_id", "reviewer_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_751ed23a6327ca955adc0426ee" ON "performance_reviews" ("tenant_id", "user_id", "period_start", "period_end") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a291fc8b253e3cb79eee1b70ba" ON "performance_reviews" ("tenant_id", "id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."privacy_requests_type_enum" AS ENUM('DATA_EXPORT', 'DATA_DELETION')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."privacy_requests_status_enum" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "privacy_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "user_id" uuid NOT NULL, "type" "public"."privacy_requests_type_enum" NOT NULL, "status" "public"."privacy_requests_status_enum" NOT NULL DEFAULT 'PENDING', "requested_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), "processed_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "expires_at" TIMESTAMP WITH TIME ZONE, "download_url" text, "file_path" text, "error_message" text, "processed_by" uuid, "metadata" jsonb, CONSTRAINT "PK_fbdea00fb2fcf274bf0d2ddf2c2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_5bf8dceabcabc6408ae195c241" ON "privacy_requests" ("tenant_id") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_1dfd1dcf92ac8624fcdf6e0bfb" ON "privacy_requests" ("tenant_id", "type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_28c2ef9c76ab901d1c58637c7e" ON "privacy_requests" ("tenant_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ef6c5f2ace1b1a1a0de5537365" ON "privacy_requests" ("tenant_id", "user_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_44a9acfce795c82ce1beaf88bc" ON "privacy_requests" ("tenant_id", "id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."task_templates_default_status_enum" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "task_templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "name" character varying NOT NULL, "description" text, "task_type_id" text, "default_status" "public"."task_templates_default_status_enum" NOT NULL DEFAULT 'PENDING', "default_commission" numeric(12,2) NOT NULL DEFAULT '0', "estimated_hours" numeric(6,2), "default_due_days" integer, "isActive" boolean NOT NULL DEFAULT true, "checklist" jsonb DEFAULT '[]', "sort_order" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_a1347b5446b9e3158e2b72f58b2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_cfc6d9c4706bd021093dfd9e45" ON "task_templates" ("tenant_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_94981adc298f36baa4d191b19d" ON "task_templates" ("tenant_id", "name") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_033f24e796eb3a4f14cac6c8dd" ON "task_templates" ("tenant_id", "id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "webhooks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "url" character varying NOT NULL, "secret" character varying NOT NULL, "events" text NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "resolved_ips" text, "ips_resolved_at" TIMESTAMP, CONSTRAINT "PK_9e8795cfc899ab7bdaa831e8527" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_4d6fcde4ac5ca1d5823f51aa18" ON "webhooks" ("tenant_id") `);
    await queryRunner.query(
      `CREATE TYPE "public"."webhook_deliveries_status_enum" AS ENUM('PENDING', 'SUCCESS', 'FAILED', 'RETRYING')`,
    );
    await queryRunner.query(
      `CREATE TABLE "webhook_deliveries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "webhook_id" uuid NOT NULL, "event_type" character varying NOT NULL, "request_body" jsonb NOT NULL, "request_headers" jsonb, "status" "public"."webhook_deliveries_status_enum" NOT NULL DEFAULT 'PENDING', "response_status" integer, "response_body" text, "attempt_number" integer NOT NULL DEFAULT '1', "max_attempts" integer NOT NULL DEFAULT '5', "next_retry_at" TIMESTAMP WITH TIME ZONE, "delivered_at" TIMESTAMP WITH TIME ZONE, "duration_ms" integer, "error_message" text, CONSTRAINT "PK_535dd409947fb6d8fc6dfc0112a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_dd2bc3de0e4a0329a4ef30600b" ON "webhook_deliveries" ("tenant_id") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_b9dce7ee955ee08740a8d48e8e" ON "webhook_deliveries" ("tenant_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2e91cd05675ec021a1c75f621f" ON "webhook_deliveries" ("tenant_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_80be90bd4cdf5954850d4888ee" ON "webhook_deliveries" ("tenant_id", "webhook_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b41a9153894afa48ae2cccd8de" ON "webhook_deliveries" ("tenant_id", "id") `,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_3a2d09d943f39912a01831a927"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "stripe_subscription_id"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "stripe_customer_id"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "stripe_price_id"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "billing_interval"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "current_period_start"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "current_period_end"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "cancel_at_period_end"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "canceled_at"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "trial_start"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "trial_end"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "quantity"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "metadata"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "stripe_subscription_id" character varying NOT NULL`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "stripe_customer_id" character varying NOT NULL`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "stripe_price_id" character varying NOT NULL`);
    await queryRunner.query(`CREATE TYPE "public"."subscriptions_billing_interval_enum" AS ENUM('MONTH', 'YEAR')`);
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD "billing_interval" "public"."subscriptions_billing_interval_enum" NOT NULL DEFAULT 'MONTH'`,
    );
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "current_period_start" TIMESTAMP WITH TIME ZONE NOT NULL`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "current_period_end" TIMESTAMP WITH TIME ZONE NOT NULL`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "cancel_at_period_end" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "canceled_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "trial_start" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "trial_end" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "quantity" integer NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "metadata" jsonb`);
    await queryRunner.query(`CREATE TYPE "public"."subscriptions_plan_enum" AS ENUM('FREE', 'PRO', 'ENTERPRISE')`);
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD "plan" "public"."subscriptions_plan_enum" NOT NULL DEFAULT 'FREE'`,
    );
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "start_date" TIMESTAMP WITH TIME ZONE NOT NULL`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "end_date" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "auto_renew" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`DROP INDEX "public"."IDX_af049b5733533a8c0dc0704cb9"`);
    await queryRunner.query(
      `ALTER TYPE "public"."subscriptions_status_enum" RENAME TO "subscriptions_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."subscriptions_status_enum" AS ENUM('ACTIVE', 'CANCELED', 'EXPIRED', 'PAST_DUE')`,
    );
    await queryRunner.query(`ALTER TABLE "subscriptions" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ALTER COLUMN "status" TYPE "public"."subscriptions_status_enum" USING "status"::"text"::"public"."subscriptions_status_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'`);
    await queryRunner.query(`DROP TYPE "public"."subscriptions_status_enum_old"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3a2d09d943f39912a01831a927" ON "subscriptions" ("stripe_subscription_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_af049b5733533a8c0dc0704cb9" ON "usage_records" ("tenant_id", "reported_at") `,
    );
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
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_ed9c7aa7846704bbcb648377e8f" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_5534ba11e10f1a9953cbdaabf16" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_23096dca2f7a9d1505d0267d4c6" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
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
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_b03c99063a4eaf084f069a4d5a7" FOREIGN KEY ("parent_id") REFERENCES "tasks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_categories" ADD CONSTRAINT "FK_d888946e8e569268b98ce4ca29e" FOREIGN KEY ("parent_id") REFERENCES "transaction_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
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
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_c9e41213ca42d50132ed7ab2b0f" FOREIGN KEY ("category_id") REFERENCES "transaction_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" ADD CONSTRAINT "FK_6883cc6070ab24d6a72dad5e7b0" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" ADD CONSTRAINT "FK_e62fd181b97caa6b150b09220b1" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_preferences" ADD CONSTRAINT "FK_64c90edc7310c6be7c10c96f675" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "consents" ADD CONSTRAINT "FK_946390b9024aba22cd1c1621430" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "time_entries" ADD CONSTRAINT "FK_104aa11ede7c8d5afbbe1fdbb24" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "time_entries" ADD CONSTRAINT "FK_f16c3c269283ee42429d09d693d" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD CONSTRAINT "FK_aed86c3f19e3b790a9e3bd4e234" FOREIGN KEY ("parent_tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_customers" ADD CONSTRAINT "FK_2abf97465a7ce3cf6e18a8508ed" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ADD CONSTRAINT "FK_e65eddc13f0cb1694ce740dc6b7" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_f6ac03431c311ccb8bbd7d3af18" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preferences" ADD CONSTRAINT "FK_458057fa75b66e68a275647da2e" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" ADD CONSTRAINT "FK_0bedbcc8d5f9b9ec4979f519597" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" ADD CONSTRAINT "FK_114fd37af44814b27ab7d74c835" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_reviews" ADD CONSTRAINT "FK_7f24e8687a99cdf941196fa5413" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_reviews" ADD CONSTRAINT "FK_2d11995817c8d382fb313dc46cf" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "privacy_requests" ADD CONSTRAINT "FK_bf80739715888ad5bbf43f67f3d" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "privacy_requests" ADD CONSTRAINT "FK_36472f11819bc596b23ee32d30c" FOREIGN KEY ("processed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "FK_a0286aeb96db651efd1ae2966f2" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "webhook_deliveries" DROP CONSTRAINT "FK_a0286aeb96db651efd1ae2966f2"`);
    await queryRunner.query(`ALTER TABLE "privacy_requests" DROP CONSTRAINT "FK_36472f11819bc596b23ee32d30c"`);
    await queryRunner.query(`ALTER TABLE "privacy_requests" DROP CONSTRAINT "FK_bf80739715888ad5bbf43f67f3d"`);
    await queryRunner.query(`ALTER TABLE "performance_reviews" DROP CONSTRAINT "FK_2d11995817c8d382fb313dc46cf"`);
    await queryRunner.query(`ALTER TABLE "performance_reviews" DROP CONSTRAINT "FK_7f24e8687a99cdf941196fa5413"`);
    await queryRunner.query(`ALTER TABLE "attendance" DROP CONSTRAINT "FK_114fd37af44814b27ab7d74c835"`);
    await queryRunner.query(`ALTER TABLE "attendance" DROP CONSTRAINT "FK_0bedbcc8d5f9b9ec4979f519597"`);
    await queryRunner.query(`ALTER TABLE "user_preferences" DROP CONSTRAINT "FK_458057fa75b66e68a275647da2e"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP CONSTRAINT "FK_f6ac03431c311ccb8bbd7d3af18"`);
    await queryRunner.query(`ALTER TABLE "payment_methods" DROP CONSTRAINT "FK_e65eddc13f0cb1694ce740dc6b7"`);
    await queryRunner.query(`ALTER TABLE "billing_customers" DROP CONSTRAINT "FK_2abf97465a7ce3cf6e18a8508ed"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP CONSTRAINT "FK_aed86c3f19e3b790a9e3bd4e234"`);
    await queryRunner.query(`ALTER TABLE "time_entries" DROP CONSTRAINT "FK_f16c3c269283ee42429d09d693d"`);
    await queryRunner.query(`ALTER TABLE "time_entries" DROP CONSTRAINT "FK_104aa11ede7c8d5afbbe1fdbb24"`);
    await queryRunner.query(`ALTER TABLE "consents" DROP CONSTRAINT "FK_946390b9024aba22cd1c1621430"`);
    await queryRunner.query(`ALTER TABLE "notification_preferences" DROP CONSTRAINT "FK_64c90edc7310c6be7c10c96f675"`);
    await queryRunner.query(`ALTER TABLE "attachments" DROP CONSTRAINT "FK_e62fd181b97caa6b150b09220b1"`);
    await queryRunner.query(`ALTER TABLE "attachments" DROP CONSTRAINT "FK_6883cc6070ab24d6a72dad5e7b0"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_c9e41213ca42d50132ed7ab2b0f"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_06fcff0206fac682a8901303684"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_8ba1e2bd056b17468f5d8fe9f8f"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_fba75deb63bb89de7b5fc92746a"`);
    await queryRunner.query(`ALTER TABLE "transaction_categories" DROP CONSTRAINT "FK_d888946e8e569268b98ce4ca29e"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_b03c99063a4eaf084f069a4d5a7"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_327d5ce9cd59770b274f8c3579f"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_ea76a982cfc3dd4bff34daaf036"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_60aa850785e570c2181cd4d25e0"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_402873fd6596d556781ac5d8ae4"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_23096dca2f7a9d1505d0267d4c6"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "FK_5534ba11e10f1a9953cbdaabf16"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "FK_ed9c7aa7846704bbcb648377e8f"`);
    await queryRunner.query(`ALTER TABLE "package_items" DROP CONSTRAINT "FK_cd8a81bf2e0947c4bf53f9aac25"`);
    await queryRunner.query(`ALTER TABLE "package_items" DROP CONSTRAINT "FK_4af1566b499be54342efb0b96c1"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP CONSTRAINT "FK_9e432b7df0d182f8d292902d1a2"`);
    await queryRunner.query(`ALTER TABLE "employee_wallets" DROP CONSTRAINT "FK_a5561fb92e47e5b1423c9a7878e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_af049b5733533a8c0dc0704cb9"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3a2d09d943f39912a01831a927"`);
    await queryRunner.query(
      `CREATE TYPE "public"."subscriptions_status_enum_old" AS ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'PAUSED')`,
    );
    await queryRunner.query(`ALTER TABLE "subscriptions" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ALTER COLUMN "status" TYPE "public"."subscriptions_status_enum_old" USING "status"::"text"::"public"."subscriptions_status_enum_old"`,
    );
    await queryRunner.query(`ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'INCOMPLETE'`);
    await queryRunner.query(`DROP TYPE "public"."subscriptions_status_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."subscriptions_status_enum_old" RENAME TO "subscriptions_status_enum"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_af049b5733533a8c0dc0704cb9" ON "usage_records" ("tenant_id", "reported_at") `,
    );
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "auto_renew"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "end_date"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "start_date"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "plan"`);
    await queryRunner.query(`DROP TYPE "public"."subscriptions_plan_enum"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "metadata"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "quantity"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "trial_end"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "trial_start"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "canceled_at"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "cancel_at_period_end"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "current_period_end"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "current_period_start"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "billing_interval"`);
    await queryRunner.query(`DROP TYPE "public"."subscriptions_billing_interval_enum"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "stripe_price_id"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "stripe_customer_id"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "stripe_subscription_id"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "metadata" jsonb`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "quantity" integer NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "trial_end" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "trial_start" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "canceled_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "cancel_at_period_end" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "current_period_end" TIMESTAMP WITH TIME ZONE NOT NULL`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "current_period_start" TIMESTAMP WITH TIME ZONE NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD "billing_interval" "public"."subscriptions_billing_interval_enum" NOT NULL DEFAULT 'MONTH'`,
    );
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "stripe_price_id" character varying NOT NULL`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "stripe_customer_id" character varying NOT NULL`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD "stripe_subscription_id" character varying NOT NULL`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3a2d09d943f39912a01831a927" ON "subscriptions" ("stripe_subscription_id") `,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_b41a9153894afa48ae2cccd8de"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_80be90bd4cdf5954850d4888ee"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2e91cd05675ec021a1c75f621f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b9dce7ee955ee08740a8d48e8e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_dd2bc3de0e4a0329a4ef30600b"`);
    await queryRunner.query(`DROP TABLE "webhook_deliveries"`);
    await queryRunner.query(`DROP TYPE "public"."webhook_deliveries_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4d6fcde4ac5ca1d5823f51aa18"`);
    await queryRunner.query(`DROP TABLE "webhooks"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_033f24e796eb3a4f14cac6c8dd"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_94981adc298f36baa4d191b19d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_cfc6d9c4706bd021093dfd9e45"`);
    await queryRunner.query(`DROP TABLE "task_templates"`);
    await queryRunner.query(`DROP TYPE "public"."task_templates_default_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_44a9acfce795c82ce1beaf88bc"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ef6c5f2ace1b1a1a0de5537365"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_28c2ef9c76ab901d1c58637c7e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1dfd1dcf92ac8624fcdf6e0bfb"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5bf8dceabcabc6408ae195c241"`);
    await queryRunner.query(`DROP TABLE "privacy_requests"`);
    await queryRunner.query(`DROP TYPE "public"."privacy_requests_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."privacy_requests_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a291fc8b253e3cb79eee1b70ba"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_751ed23a6327ca955adc0426ee"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_87baa58d173e0aafdc71340282"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7f6176b1ae7f1478d109219458"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b9a0441863f21815d352c42b77"`);
    await queryRunner.query(`DROP TABLE "performance_reviews"`);
    await queryRunner.query(`DROP TYPE "public"."performance_reviews_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."performance_reviews_period_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_190318399b1c34afe329de7b11"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e1ceb697cdea2c117d6818fcea"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_effb98e9f2cc1879e1f088fda8"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c2f7fba0ddece3c4eabbaceb2e"`);
    await queryRunner.query(`DROP TABLE "attendance"`);
    await queryRunner.query(`DROP TYPE "public"."attendance_leave_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."attendance_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_472772835d7d3d90af3bbb413f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_374a79c5eaafd0c0bfe57012aa"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_997f872384513653afac31a9c4"`);
    await queryRunner.query(`DROP TABLE "department_budgets"`);
    await queryRunner.query(`DROP TABLE "user_preferences"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8344625d2464d332185030902f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_af049b5733533a8c0dc0704cb9"`);
    await queryRunner.query(`DROP TABLE "usage_records"`);
    await queryRunner.query(`DROP TYPE "public"."usage_records_metric_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f6ac03431c311ccb8bbd7d3af1"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3a2d09d943f39912a01831a927"`);
    await queryRunner.query(`DROP TABLE "subscriptions"`);
    await queryRunner.query(`DROP TYPE "public"."subscriptions_billing_interval_enum"`);
    await queryRunner.query(`DROP TYPE "public"."subscriptions_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e65eddc13f0cb1694ce740dc6b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1f03501f788e64bf699d206fa5"`);
    await queryRunner.query(`DROP TABLE "payment_methods"`);
    await queryRunner.query(`DROP TYPE "public"."payment_methods_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2abf97465a7ce3cf6e18a8508e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8236710a5135642b2311310209"`);
    await queryRunner.query(`DROP TABLE "billing_customers"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2ecfa961f2f3e33fff8e19b6c7"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_91185d86d5d7557b19abbb2868"`);
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_973ceb9e119e69f5b42fbfa44a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c20ed35f3d31d486aabcd0564d"`);
    await queryRunner.query(`DROP TABLE "email_verification_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d3ec81cabc3c03a9f92b7a37f7"`);
    await queryRunner.query(`DROP TABLE "daily_metrics"`);
    await queryRunner.query(`DROP TABLE "tenants"`);
    await queryRunner.query(`DROP TYPE "public"."tenants_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."tenants_base_currency_enum"`);
    await queryRunner.query(`DROP TYPE "public"."tenants_subscriptionplan_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b69921d81fb005fbcfdd7967ca"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_93ab8d9d6d5ac5798f4b7d01a1"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_76262f9e80f47de12c3dfa9a89"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1a468af552a0c98d521a271722"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_794b624ef3b3b9b07bf3cb3d65"`);
    await queryRunner.query(`DROP TABLE "time_entries"`);
    await queryRunner.query(`DROP TYPE "public"."time_entries_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a8c683641d0c849c9ba682709e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_10fd6e488c564af9d71cc3376b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f26200736ecd618cff7dc32365"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_949e8b074f10fe283dc754bfb8"`);
    await queryRunner.query(`DROP TABLE "consents"`);
    await queryRunner.query(`DROP TYPE "public"."consents_type_enum"`);
    await queryRunner.query(`DROP TABLE "notification_preferences"`);
    await queryRunner.query(`DROP TYPE "public"."notification_preferences_frequency_enum"`);
    await queryRunner.query(`DROP TYPE "public"."notification_preferences_notification_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7058f2082c7a4ddc189ad7c9a8"`);
    await queryRunner.query(`DROP TABLE "attachments"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_15e34a853fee57b67fb3ac4d52"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2982dc30aa931f4db2ff53c648"`);
    await queryRunner.query(`DROP TABLE "email_templates"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7b96dc34990c9c3462f604ec89"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_90dca85e9c4fbf1363e6732386"`);
    await queryRunner.query(`DROP TABLE "payroll_runs"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b432cb72bfeb547a809e75fbd6"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9a6f00c87b582e7bbfd6e6f2ed"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e6ed024c6f398afadfb9cbff82"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7cfe3fe293be3c1ea331ad52e2"`);
    await queryRunner.query(`DROP TABLE "recurring_transactions"`);
    await queryRunner.query(`DROP TYPE "public"."recurring_transactions_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."recurring_transactions_frequency_enum"`);
    await queryRunner.query(`DROP TYPE "public"."recurring_transactions_currency_enum"`);
    await queryRunner.query(`DROP TYPE "public"."recurring_transactions_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4a37d57cd4b1df2e4c3f3c3981"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f07854cfd9da774d04ba5dfbf7"`);
    await queryRunner.query(`DROP TABLE "payouts"`);
    await queryRunner.query(`DROP TYPE "public"."payouts_currency_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_53e6600ec819e27323c9744795"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b36aa1f4e4a3684b302536d51e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e34fe53feb631ff94ab316a707"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f1727abfbb0b1dfd42c357b8c3"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3906d00f6a4cd10bd8acef9ca0"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4f27188c6c1d993bc76aeddcde"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`DROP TYPE "public"."transactions_currency_enum"`);
    await queryRunner.query(`DROP TYPE "public"."transactions_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_01e19ef89d1023edf0353d89d2"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_27840c32ef0173a3dc3a537a89"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a9c93bbc847b97e2d84d5aebfa"`);
    await queryRunner.query(`DROP TABLE "transaction_categories"`);
    await queryRunner.query(`DROP TYPE "public"."transaction_categories_applicabletype_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a7838d2ba25be1342091b6695f"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_96bb2f14a3cd3f8e046898b08b"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1e82eb99ade0bbd12cba554ed4"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_abb18e7a1300f18a66253a00e8"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_20d090a7b83189b4cddb3e3d0e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b03c99063a4eaf084f069a4d5a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_327d5ce9cd59770b274f8c3579"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ea76a982cfc3dd4bff34daaf03"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_60aa850785e570c2181cd4d25e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_93edccfc42408754c4b5957105"`);
    await queryRunner.query(`DROP TABLE "tasks"`);
    await queryRunner.query(`DROP TYPE "public"."tasks_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_716b6b4e89bad3466d007b81d7"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b678e8df5cba244396c89d6b64"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_40ea7a6141b2fde9058ff2837c"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_402873fd6596d556781ac5d8ae"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_23096dca2f7a9d1505d0267d4c"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0c41823fa6a879a6aeba177465"`);
    await queryRunner.query(`DROP TABLE "bookings"`);
    await queryRunner.query(`DROP TYPE "public"."bookings_payment_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."bookings_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2d3ced63b2eb8ae2407b1d3493"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ca69be6052c5b4fb34e19a4437"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c7c70191c624dc41d7cbafdc10"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_344c231fafffe51efbd3f17e6d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_545e976a52406b41671c3c11b1"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_440f531f452dcc4389d201b9d4"`);
    await queryRunner.query(`DROP TABLE "invoices"`);
    await queryRunner.query(`DROP TYPE "public"."invoices_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7b70ba8d3cc445c123cf0f280e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_64c382ca195306f588c79055c7"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b8cb5e0d968c9498a3295183f3"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_84e812b6defb372516be517413"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e7d8b637725986e7b5fa774a3f"`);
    await queryRunner.query(`DROP TABLE "clients"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d013f113228dc39673239ba2a9"`);
    await queryRunner.query(`DROP TABLE "service_packages"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f4db2b9ac32351c52741cbdd2f"`);
    await queryRunner.query(`DROP TABLE "package_items"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d57e22e16d8b0c32f51af9de8b"`);
    await queryRunner.query(`DROP TABLE "task_types"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_bb3a22ba6c6985c30ca3edc47b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_414e162a13c062cababc0550a1"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b3cf4b94987d3b77e9242af37e"`);
    await queryRunner.query(`DROP TABLE "profiles"`);
    await queryRunner.query(`DROP TYPE "public"."profiles_contract_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_89dff4a9ebb0f4ba95aa85348d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5c06dc4ef5dde0151c0fbeaf0a"`);
    await queryRunner.query(`DROP TABLE "employee_wallets"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_67c4ff6334797c722a15eec21f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_85c204d8e47769ac183b32bf9c"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6f18d459490bb48923b1f40bdb"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_bd2726fd31b35443f2245b93ba"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
  }
}
