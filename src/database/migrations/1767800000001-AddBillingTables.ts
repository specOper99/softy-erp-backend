import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBillingTables1767800000001 implements MigrationInterface {
  name = 'AddBillingTables1767800000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."subscriptions_status_enum" AS ENUM(
          'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 
          'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'PAUSED'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."subscriptions_billing_interval_enum" AS ENUM('MONTH', 'YEAR');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."payment_methods_type_enum" AS ENUM('CARD', 'BANK_ACCOUNT', 'SEPA_DEBIT');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."usage_records_metric_enum" AS ENUM('USERS', 'BOOKINGS', 'STORAGE_GB', 'API_CALLS');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "billing_customers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tenant_id" uuid NOT NULL,
        "stripe_customer_id" character varying NOT NULL,
        "email" character varying,
        "name" character varying,
        "default_payment_method_id" character varying,
        "address" jsonb,
        "tax_exempt" boolean NOT NULL DEFAULT false,
        "invoice_prefix" character varying,
        "metadata" jsonb,
        CONSTRAINT "PK_billing_customers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_billing_customers_tenant" UNIQUE ("tenant_id"),
        CONSTRAINT "UQ_billing_customers_stripe" UNIQUE ("stripe_customer_id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "billing_customers"
      ADD CONSTRAINT "FK_billing_customers_tenant"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tenant_id" uuid NOT NULL,
        "stripe_subscription_id" character varying NOT NULL,
        "stripe_customer_id" character varying NOT NULL,
        "stripe_price_id" character varying NOT NULL,
        "status" "public"."subscriptions_status_enum" NOT NULL DEFAULT 'INCOMPLETE',
        "billing_interval" "public"."subscriptions_billing_interval_enum" NOT NULL DEFAULT 'MONTH',
        "current_period_start" TIMESTAMP WITH TIME ZONE NOT NULL,
        "current_period_end" TIMESTAMP WITH TIME ZONE NOT NULL,
        "cancel_at_period_end" boolean NOT NULL DEFAULT false,
        "canceled_at" TIMESTAMP WITH TIME ZONE,
        "trial_start" TIMESTAMP WITH TIME ZONE,
        "trial_end" TIMESTAMP WITH TIME ZONE,
        "quantity" integer NOT NULL DEFAULT 0,
        "metadata" jsonb,
        CONSTRAINT "PK_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_subscriptions_tenant" UNIQUE ("tenant_id"),
        CONSTRAINT "UQ_subscriptions_stripe" UNIQUE ("stripe_subscription_id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ADD CONSTRAINT "FK_subscriptions_tenant"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_methods" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tenant_id" uuid NOT NULL,
        "stripe_payment_method_id" character varying NOT NULL,
        "type" "public"."payment_methods_type_enum" NOT NULL DEFAULT 'CARD',
        "brand" character varying,
        "last_four" character varying(4),
        "exp_month" integer,
        "exp_year" integer,
        "is_default" boolean NOT NULL DEFAULT false,
        "billingDetails" jsonb,
        CONSTRAINT "PK_payment_methods" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_methods_stripe" UNIQUE ("stripe_payment_method_id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_payment_methods_tenant" ON "payment_methods" ("tenant_id")`);

    await queryRunner.query(`
      ALTER TABLE "payment_methods"
      ADD CONSTRAINT "FK_payment_methods_tenant"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "usage_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tenant_id" uuid NOT NULL,
        "subscription_id" uuid,
        "metric" "public"."usage_records_metric_enum" NOT NULL,
        "quantity" integer NOT NULL,
        "period_start" TIMESTAMP WITH TIME ZONE NOT NULL,
        "period_end" TIMESTAMP WITH TIME ZONE NOT NULL,
        "reported_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "stripe_usage_record_id" character varying,
        "metadata" jsonb,
        CONSTRAINT "PK_usage_records" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_usage_records_tenant_metric_period" ON "usage_records" ("tenant_id", "metric", "period_start")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_usage_records_tenant_reported" ON "usage_records" ("tenant_id", "reported_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_usage_records_tenant_reported"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_usage_records_tenant_metric_period"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "usage_records"`);

    await queryRunner.query(`ALTER TABLE "payment_methods" DROP CONSTRAINT IF EXISTS "FK_payment_methods_tenant"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_payment_methods_tenant"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_methods"`);

    await queryRunner.query(`ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "FK_subscriptions_tenant"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscriptions"`);

    await queryRunner.query(`ALTER TABLE "billing_customers" DROP CONSTRAINT IF EXISTS "FK_billing_customers_tenant"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "billing_customers"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."usage_records_metric_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."payment_methods_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."subscriptions_billing_interval_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."subscriptions_status_enum"`);
  }
}
