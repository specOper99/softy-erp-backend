import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNewEntities1767800000000 implements MigrationInterface {
  name = 'AddNewEntities1767800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================================
    // ENUM TYPES
    // ============================================================

    // Privacy Request Types
    await queryRunner.query(`
      CREATE TYPE "public"."privacy_requests_type_enum" AS ENUM('DATA_EXPORT', 'DATA_DELETION')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."privacy_requests_status_enum" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')
    `);

    // Consent Types
    await queryRunner.query(`
      CREATE TYPE "public"."consents_type_enum" AS ENUM('TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'MARKETING_EMAILS', 'DATA_PROCESSING', 'ANALYTICS', 'THIRD_PARTY_SHARING')
    `);

    // Webhook Delivery Status
    await queryRunner.query(`
      CREATE TYPE "public"."webhook_deliveries_status_enum" AS ENUM('PENDING', 'SUCCESS', 'FAILED', 'RETRYING')
    `);

    // Performance Review Enums
    await queryRunner.query(`
      CREATE TYPE "public"."performance_reviews_status_enum" AS ENUM('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'COMPLETED')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."performance_reviews_period_type_enum" AS ENUM('QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'PROBATION', 'AD_HOC')
    `);

    // Attendance Enums
    await queryRunner.query(`
      CREATE TYPE "public"."attendance_status_enum" AS ENUM('PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY', 'REMOTE', 'SICK')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."attendance_leave_type_enum" AS ENUM('ANNUAL', 'SICK', 'PERSONAL', 'UNPAID', 'MATERNITY', 'PATERNITY')
    `);

    // Time Entry Status
    await queryRunner.query(`
      CREATE TYPE "public"."time_entries_status_enum" AS ENUM('RUNNING', 'STOPPED')
    `);

    // Recurring Transaction Enums
    await queryRunner.query(`
      CREATE TYPE "public"."recurring_transactions_frequency_enum" AS ENUM('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."recurring_transactions_status_enum" AS ENUM('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')
    `);

    // ============================================================
    // TABLES
    // ============================================================

    // 1. Privacy Requests Table
    await queryRunner.query(`
      CREATE TABLE "privacy_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "type" "public"."privacy_requests_type_enum" NOT NULL,
        "status" "public"."privacy_requests_status_enum" NOT NULL DEFAULT 'PENDING',
        "requested_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "processed_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "expires_at" TIMESTAMP WITH TIME ZONE,
        "download_url" character varying,
        "file_path" character varying,
        "error_message" text,
        "processed_by" uuid,
        "metadata" jsonb,
        CONSTRAINT "PK_privacy_requests" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_privacy_requests_tenant_id" ON "privacy_requests" ("tenant_id", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_privacy_requests_tenant_user" ON "privacy_requests" ("tenant_id", "user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_privacy_requests_tenant_status" ON "privacy_requests" ("tenant_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_privacy_requests_tenant_type" ON "privacy_requests" ("tenant_id", "type")`,
    );

    await queryRunner.query(`
      ALTER TABLE "privacy_requests"
      ADD CONSTRAINT "FK_privacy_requests_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "privacy_requests"
      ADD CONSTRAINT "FK_privacy_requests_processor"
      FOREIGN KEY ("processed_by") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    // 2. Consents Table
    await queryRunner.query(`
      CREATE TABLE "consents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "type" "public"."consents_type_enum" NOT NULL,
        "granted" boolean NOT NULL DEFAULT false,
        "granted_at" TIMESTAMP WITH TIME ZONE,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "policy_version" character varying,
        "ip_address" character varying,
        "user_agent" character varying,
        CONSTRAINT "PK_consents" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_consents_tenant_id" ON "consents" ("tenant_id", "id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_consents_tenant_user_type" ON "consents" ("tenant_id", "user_id", "type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_consents_tenant_type" ON "consents" ("tenant_id", "type")`,
    );

    await queryRunner.query(`
      ALTER TABLE "consents"
      ADD CONSTRAINT "FK_consents_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    // 3. Webhook Deliveries Table
    await queryRunner.query(`
      CREATE TABLE "webhook_deliveries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tenant_id" uuid NOT NULL,
        "webhook_id" uuid NOT NULL,
        "event_type" character varying NOT NULL,
        "request_body" jsonb NOT NULL,
        "request_headers" jsonb,
        "status" "public"."webhook_deliveries_status_enum" NOT NULL DEFAULT 'PENDING',
        "response_status" integer,
        "response_body" text,
        "attempt_number" integer NOT NULL DEFAULT 1,
        "max_attempts" integer NOT NULL DEFAULT 5,
        "next_retry_at" TIMESTAMP WITH TIME ZONE,
        "delivered_at" TIMESTAMP WITH TIME ZONE,
        "duration_ms" integer,
        "error_message" text,
        CONSTRAINT "PK_webhook_deliveries" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_webhook_deliveries_tenant_id" ON "webhook_deliveries" ("tenant_id", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_webhook_deliveries_tenant_webhook" ON "webhook_deliveries" ("tenant_id", "webhook_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_webhook_deliveries_tenant_status" ON "webhook_deliveries" ("tenant_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_webhook_deliveries_tenant_created" ON "webhook_deliveries" ("tenant_id", "created_at")`,
    );

    await queryRunner.query(`
      ALTER TABLE "webhook_deliveries"
      ADD CONSTRAINT "FK_webhook_deliveries_webhook"
      FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE
    `);

    // 4. Performance Reviews Table
    await queryRunner.query(`
      CREATE TABLE "performance_reviews" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "reviewer_id" uuid NOT NULL,
        "period_type" "public"."performance_reviews_period_type_enum" NOT NULL DEFAULT 'QUARTERLY',
        "period_start" date NOT NULL,
        "period_end" date NOT NULL,
        "status" "public"."performance_reviews_status_enum" NOT NULL DEFAULT 'DRAFT',
        "overall_rating" integer,
        "strengths" jsonb DEFAULT '[]',
        "areas_for_improvement" jsonb DEFAULT '[]',
        "goals" jsonb DEFAULT '[]',
        "reviewer_comments" text,
        "employee_comments" text,
        "submitted_at" TIMESTAMP WITH TIME ZONE,
        "acknowledged_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_performance_reviews" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_performance_reviews_rating" CHECK ("overall_rating" IS NULL OR ("overall_rating" >= 1 AND "overall_rating" <= 5))
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_performance_reviews_tenant_id" ON "performance_reviews" ("tenant_id", "id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_performance_reviews_tenant_user_period" ON "performance_reviews" ("tenant_id", "user_id", "period_start", "period_end")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_performance_reviews_tenant_reviewer" ON "performance_reviews" ("tenant_id", "reviewer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_performance_reviews_tenant_status" ON "performance_reviews" ("tenant_id", "status")`,
    );

    await queryRunner.query(`
      ALTER TABLE "performance_reviews"
      ADD CONSTRAINT "FK_performance_reviews_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "performance_reviews"
      ADD CONSTRAINT "FK_performance_reviews_reviewer"
      FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    // 5. Attendance Table
    await queryRunner.query(`
      CREATE TABLE "attendance" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "date" date NOT NULL,
        "check_in" TIMESTAMP WITH TIME ZONE,
        "check_out" TIMESTAMP WITH TIME ZONE,
        "status" "public"."attendance_status_enum" NOT NULL DEFAULT 'PRESENT',
        "leave_type" "public"."attendance_leave_type_enum",
        "worked_hours" numeric(5,2),
        "notes" text,
        "approved_by" uuid,
        "approved_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_attendance" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_attendance_tenant_id" ON "attendance" ("tenant_id", "id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_attendance_tenant_user_date" ON "attendance" ("tenant_id", "user_id", "date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_attendance_tenant_date" ON "attendance" ("tenant_id", "date")`,
    );

    await queryRunner.query(`
      ALTER TABLE "attendance"
      ADD CONSTRAINT "FK_attendance_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance"
      ADD CONSTRAINT "FK_attendance_approver"
      FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    // 6. Task Templates Table
    await queryRunner.query(`
      CREATE TABLE "task_templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tenant_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "task_type_id" uuid,
        "default_status" "public"."tasks_status_enum" NOT NULL DEFAULT 'PENDING',
        "default_commission" numeric(12,2) NOT NULL DEFAULT 0,
        "estimated_hours" numeric(6,2),
        "default_due_days" integer,
        "isActive" boolean NOT NULL DEFAULT true,
        "checklist" jsonb DEFAULT '[]',
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_task_templates" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_task_templates_tenant_id" ON "task_templates" ("tenant_id", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_task_templates_tenant_name" ON "task_templates" ("tenant_id", "name")`,
    );

    // 7. Time Entries Table
    await queryRunner.query(`
      CREATE TABLE "time_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tenant_id" uuid NOT NULL,
        "task_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "start_time" TIMESTAMP WITH TIME ZONE NOT NULL,
        "end_time" TIMESTAMP WITH TIME ZONE,
        "duration_minutes" integer,
        "notes" text,
        "status" "public"."time_entries_status_enum" NOT NULL DEFAULT 'RUNNING',
        "billable" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_time_entries" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_time_entries_tenant_id" ON "time_entries" ("tenant_id", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_time_entries_tenant_task" ON "time_entries" ("tenant_id", "task_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_time_entries_tenant_user" ON "time_entries" ("tenant_id", "user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_time_entries_tenant_start" ON "time_entries" ("tenant_id", "start_time")`,
    );

    await queryRunner.query(`
      ALTER TABLE "time_entries"
      ADD CONSTRAINT "FK_time_entries_task"
      FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "time_entries"
      ADD CONSTRAINT "FK_time_entries_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    // 8. Transaction Categories Table
    await queryRunner.query(`
      CREATE TABLE "transaction_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tenant_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "description" character varying,
        "applicableType" "public"."transactions_type_enum",
        "isActive" boolean NOT NULL DEFAULT true,
        "parentId" uuid,
        CONSTRAINT "PK_transaction_categories" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_transaction_categories_tenant_id" ON "transaction_categories" ("tenant_id", "id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_transaction_categories_tenant_name" ON "transaction_categories" ("tenant_id", "name")`,
    );

    await queryRunner.query(`
      ALTER TABLE "transaction_categories"
      ADD CONSTRAINT "FK_transaction_categories_parent"
      FOREIGN KEY ("parentId") REFERENCES "transaction_categories"("id") ON DELETE SET NULL
    `);

    // 9. Recurring Transactions Table
    await queryRunner.query(`
      CREATE TABLE "recurring_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tenant_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "type" "public"."transactions_type_enum" NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "currency" "public"."currency_enum" NOT NULL DEFAULT 'USD',
        "category" character varying,
        "department" character varying,
        "description" text,
        "frequency" "public"."recurring_transactions_frequency_enum" NOT NULL,
        "interval" integer NOT NULL DEFAULT 1,
        "start_date" date NOT NULL,
        "end_date" date,
        "next_run_date" date NOT NULL,
        "last_run_date" date,
        "run_count" integer NOT NULL DEFAULT 0,
        "max_occurrences" integer,
        "status" "public"."recurring_transactions_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "notify_before_days" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_recurring_transactions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_recurring_transactions_tenant_id" ON "recurring_transactions" ("tenant_id", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_recurring_transactions_tenant_status" ON "recurring_transactions" ("tenant_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_recurring_transactions_tenant_next_run" ON "recurring_transactions" ("tenant_id", "next_run_date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order of creation (respect FK dependencies)

    // 9. Recurring Transactions
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_recurring_transactions_tenant_next_run"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_recurring_transactions_tenant_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_recurring_transactions_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "recurring_transactions"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."recurring_transactions_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."recurring_transactions_frequency_enum"`,
    );

    // 8. Transaction Categories
    await queryRunner.query(
      `ALTER TABLE "transaction_categories" DROP CONSTRAINT IF EXISTS "FK_transaction_categories_parent"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_transaction_categories_tenant_name"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_transaction_categories_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_categories"`);

    // 7. Time Entries
    await queryRunner.query(
      `ALTER TABLE "time_entries" DROP CONSTRAINT IF EXISTS "FK_time_entries_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "time_entries" DROP CONSTRAINT IF EXISTS "FK_time_entries_task"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_time_entries_tenant_start"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_time_entries_tenant_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_time_entries_tenant_task"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_time_entries_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "time_entries"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."time_entries_status_enum"`,
    );

    // 6. Task Templates
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_task_templates_tenant_name"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_task_templates_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "task_templates"`);

    // 5. Attendance
    await queryRunner.query(
      `ALTER TABLE "attendance" DROP CONSTRAINT IF EXISTS "FK_attendance_approver"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" DROP CONSTRAINT IF EXISTS "FK_attendance_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_attendance_tenant_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_attendance_tenant_user_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_attendance_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."attendance_leave_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."attendance_status_enum"`,
    );

    // 4. Performance Reviews
    await queryRunner.query(
      `ALTER TABLE "performance_reviews" DROP CONSTRAINT IF EXISTS "FK_performance_reviews_reviewer"`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_reviews" DROP CONSTRAINT IF EXISTS "FK_performance_reviews_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_performance_reviews_tenant_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_performance_reviews_tenant_reviewer"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_performance_reviews_tenant_user_period"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_performance_reviews_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_reviews"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."performance_reviews_period_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."performance_reviews_status_enum"`,
    );

    // 3. Webhook Deliveries
    await queryRunner.query(
      `ALTER TABLE "webhook_deliveries" DROP CONSTRAINT IF EXISTS "FK_webhook_deliveries_webhook"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_webhook_deliveries_tenant_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_webhook_deliveries_tenant_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_webhook_deliveries_tenant_webhook"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_webhook_deliveries_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "webhook_deliveries"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."webhook_deliveries_status_enum"`,
    );

    // 2. Consents
    await queryRunner.query(
      `ALTER TABLE "consents" DROP CONSTRAINT IF EXISTS "FK_consents_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_consents_tenant_type"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_consents_tenant_user_type"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_consents_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "consents"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."consents_type_enum"`,
    );

    // 1. Privacy Requests
    await queryRunner.query(
      `ALTER TABLE "privacy_requests" DROP CONSTRAINT IF EXISTS "FK_privacy_requests_processor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "privacy_requests" DROP CONSTRAINT IF EXISTS "FK_privacy_requests_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_privacy_requests_tenant_type"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_privacy_requests_tenant_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_privacy_requests_tenant_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_privacy_requests_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "privacy_requests"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."privacy_requests_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."privacy_requests_type_enum"`,
    );
  }
}
