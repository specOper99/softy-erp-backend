import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial database schema migration - creates all tables from scratch.
 * Run this on a fresh database to set up the complete schema.
 */
export class InitialSchema1703850000000 implements MigrationInterface {
  name = 'InitialSchema1703850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable uuid-ossp extension FIRST so we can use uuid_generate_v4()
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ==== ENUMS ====
    await queryRunner.query(`
      CREATE TYPE "tenants_subscriptionplan_enum" AS ENUM ('FREE', 'PRO', 'ENTERPRISE')
    `);
    await queryRunner.query(`
      CREATE TYPE "tenants_status_enum" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED')
    `);
    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM ('ADMIN', 'OPS_MANAGER', 'FIELD_STAFF')
    `);
    await queryRunner.query(`
      CREATE TYPE "bookings_status_enum" AS ENUM ('DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')
    `);
    await queryRunner.query(`
      CREATE TYPE "tasks_status_enum" AS ENUM ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')
    `);
    await queryRunner.query(`
      CREATE TYPE "transactions_type_enum" AS ENUM ('INCOME', 'EXPENSE', 'PAYROLL')
    `);
    await queryRunner.query(`
      CREATE TYPE "transactions_reference_type_enum" AS ENUM ('BOOKING', 'TASK', 'PAYROLL', 'OTHER')
    `);

    // ==== TENANTS (no dependencies) ====
    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "slug" character varying NOT NULL,
        "subscriptionPlan" "tenants_subscriptionplan_enum" NOT NULL DEFAULT 'FREE',
        "status" "tenants_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_tenants_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_tenants" PRIMARY KEY ("id")
      )
    `);

    // ==== USERS (depends on tenants) ====
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" character varying NOT NULL,
        "tenant_id" uuid,
        "password_hash" character varying NOT NULL,
        "role" "users_role_enum" NOT NULL DEFAULT 'FIELD_STAFF',
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_users_email_tenant" ON "users" ("email", "tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_users_tenant" ON "users" ("tenant_id")
    `);

    // ==== PROFILES (depends on users) ====
    await queryRunner.query(`
      CREATE TABLE "profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "first_name" character varying,
        "last_name" character varying,
        "job_title" character varying,
        "base_salary" numeric(12,2) NOT NULL DEFAULT '0',
        "hire_date" date,
        "bank_account" character varying,
        "phone" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "UQ_profiles_user" UNIQUE ("user_id"),
        CONSTRAINT "PK_profiles" PRIMARY KEY ("id")
      )
    `);

    // ==== EMPLOYEE WALLETS (depends on users) ====
    await queryRunner.query(`
      CREATE TABLE "employee_wallets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "pending_balance" numeric(12,2) NOT NULL DEFAULT '0',
        "payable_balance" numeric(12,2) NOT NULL DEFAULT '0',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_employee_wallets_user" UNIQUE ("user_id"),
        CONSTRAINT "PK_employee_wallets" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_employee_wallets_tenant" ON "employee_wallets" ("tenant_id")
    `);

    // ==== TASK TYPES (no dependencies except tenant) ====
    await queryRunner.query(`
      CREATE TABLE "task_types" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "default_commission_amount" numeric(12,2) NOT NULL DEFAULT '0',
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_task_types" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_task_types_tenant" ON "task_types" ("tenant_id")
    `);

    // ==== SERVICE PACKAGES (no dependencies except tenant) ====
    await queryRunner.query(`
      CREATE TABLE "service_packages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "price" numeric(12,2) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_service_packages" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_service_packages_tenant" ON "service_packages" ("tenant_id")
    `);

    // ==== PACKAGE ITEMS (depends on service_packages, task_types) ====
    await queryRunner.query(`
      CREATE TABLE "package_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "package_id" uuid NOT NULL,
        "task_type_id" uuid NOT NULL,
        "quantity" integer NOT NULL DEFAULT '1',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_package_items" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_package_items_tenant" ON "package_items" ("tenant_id")
    `);

    // ==== BOOKINGS (depends on service_packages) ====
    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "client_name" character varying NOT NULL,
        "client_phone" character varying,
        "client_email" character varying,
        "event_date" TIMESTAMP WITH TIME ZONE NOT NULL,
        "status" "bookings_status_enum" NOT NULL DEFAULT 'DRAFT',
        "total_price" numeric(12,2) NOT NULL,
        "package_id" uuid NOT NULL,
        "notes" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_bookings" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_bookings_tenant" ON "bookings" ("tenant_id")
    `);

    // ==== TASKS (depends on bookings, task_types, users) ====
    await queryRunner.query(`
      CREATE TABLE "tasks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "booking_id" uuid NOT NULL,
        "task_type_id" uuid NOT NULL,
        "assigned_user_id" uuid,
        "status" "tasks_status_enum" NOT NULL DEFAULT 'PENDING',
        "commission_snapshot" numeric(12,2) NOT NULL DEFAULT '0',
        "due_date" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "notes" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_tasks" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tasks_tenant" ON "tasks" ("tenant_id")
    `);

    // ==== TRANSACTIONS (no dependencies except tenant) ====
    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "type" "transactions_type_enum" NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "category" character varying,
        "reference_id" uuid,
        "reference_type" "transactions_reference_type_enum",
        "description" text,
        "transaction_date" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transactions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_transactions_tenant" ON "transactions" ("tenant_id")
    `);

    // ==== AUDIT LOGS (no dependencies) ====
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" character varying,
        "action" character varying NOT NULL,
        "entity_name" character varying NOT NULL,
        "entity_id" character varying NOT NULL,
        "old_values" jsonb,
        "new_values" jsonb,
        "notes" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);

    // ==== REFRESH TOKENS (depends on users) ====
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "token_hash" character varying NOT NULL,
        "user_id" uuid NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "is_revoked" boolean NOT NULL DEFAULT false,
        "user_agent" character varying(512),
        "ip_address" character varying(45),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "last_used_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "UQ_refresh_tokens_hash" UNIQUE ("token_hash"),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_tokens_hash" ON "refresh_tokens" ("token_hash")
    `);

    // ==== ATTACHMENTS (depends on bookings, tasks) ====
    await queryRunner.query(`
      CREATE TABLE "attachments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "url" character varying NOT NULL,
        "mime_type" character varying NOT NULL,
        "size" integer NOT NULL,
        "booking_id" uuid,
        "task_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_attachments" PRIMARY KEY ("id")
      )
    `);

    // ==== FOREIGN KEYS ====
    // profiles -> users
    await queryRunner.query(`
      ALTER TABLE "profiles" ADD CONSTRAINT "FK_profiles_user" 
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // employee_wallets -> users
    await queryRunner.query(`
      ALTER TABLE "employee_wallets" ADD CONSTRAINT "FK_employee_wallets_user" 
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // package_items -> service_packages
    await queryRunner.query(`
      ALTER TABLE "package_items" ADD CONSTRAINT "FK_package_items_package" 
      FOREIGN KEY ("package_id") REFERENCES "service_packages"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // package_items -> task_types
    await queryRunner.query(`
      ALTER TABLE "package_items" ADD CONSTRAINT "FK_package_items_task_type" 
      FOREIGN KEY ("task_type_id") REFERENCES "task_types"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // bookings -> service_packages
    await queryRunner.query(`
      ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_package" 
      FOREIGN KEY ("package_id") REFERENCES "service_packages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // tasks -> bookings
    await queryRunner.query(`
      ALTER TABLE "tasks" ADD CONSTRAINT "FK_tasks_booking" 
      FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // tasks -> task_types
    await queryRunner.query(`
      ALTER TABLE "tasks" ADD CONSTRAINT "FK_tasks_task_type" 
      FOREIGN KEY ("task_type_id") REFERENCES "task_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // tasks -> users (assigned)
    await queryRunner.query(`
      ALTER TABLE "tasks" ADD CONSTRAINT "FK_tasks_user" 
      FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // refresh_tokens -> users
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_refresh_tokens_user" 
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // attachments -> bookings
    await queryRunner.query(`
      ALTER TABLE "attachments" ADD CONSTRAINT "FK_attachments_booking" 
      FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // attachments -> tasks
    await queryRunner.query(`
      ALTER TABLE "attachments" ADD CONSTRAINT "FK_attachments_task" 
      FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys first
    await queryRunner.query(
      `ALTER TABLE "attachments" DROP CONSTRAINT IF EXISTS "FK_attachments_task"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" DROP CONSTRAINT IF EXISTS "FK_attachments_booking"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "FK_refresh_tokens_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "FK_tasks_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "FK_tasks_task_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "FK_tasks_booking"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "FK_bookings_package"`,
    );
    await queryRunner.query(
      `ALTER TABLE "package_items" DROP CONSTRAINT IF EXISTS "FK_package_items_task_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "package_items" DROP CONSTRAINT IF EXISTS "FK_package_items_package"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_wallets" DROP CONSTRAINT IF EXISTS "FK_employee_wallets_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "FK_profiles_user"`,
    );

    // Drop tables in reverse order
    await queryRunner.query(`DROP TABLE IF EXISTS "attachments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tasks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bookings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "package_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "service_packages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "task_types"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_wallets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants"`);

    // Drop enums
    await queryRunner.query(
      `DROP TYPE IF EXISTS "transactions_reference_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "transactions_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tasks_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bookings_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tenants_status_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "tenants_subscriptionplan_enum"`,
    );

    // Note: uuid-ossp is usually not dropped to avoid affecting other schemas using it
  }
}
