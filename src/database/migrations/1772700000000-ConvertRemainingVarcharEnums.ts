import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Converts legacy varchar columns to PostgreSQL enum types expected by entity
 * metadata and enum-sync. Also ensures shared currency_enum labels exist before
 * payouts/transactions currency columns are cast.
 */
export class ConvertRemainingVarcharEnums1772700000000 implements MigrationInterface {
  name = 'ConvertRemainingVarcharEnums1772700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'currency_enum') THEN
          CREATE TYPE "public"."currency_enum" AS ENUM ('USD', 'EUR', 'GBP', 'AED', 'SAR', 'IQD');
        ELSE
          ALTER TYPE "public"."currency_enum" ADD VALUE IF NOT EXISTS 'IQD';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payouts_status_enum') THEN
          CREATE TYPE "public"."payouts_status_enum" AS ENUM (
            'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_users_role_enum') THEN
          CREATE TYPE "public"."platform_users_role_enum" AS ENUM (
            'SUPER_ADMIN',
            'SUPPORT_ADMIN',
            'BILLING_ADMIN',
            'COMPLIANCE_ADMIN',
            'SECURITY_ADMIN',
            'ANALYTICS_VIEWER'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_users_status_enum') THEN
          CREATE TYPE "public"."platform_users_status_enum" AS ENUM ('active', 'suspended', 'locked');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_audit_logs_action_enum') THEN
          CREATE TYPE "public"."platform_audit_logs_action_enum" AS ENUM (
            'TENANT_CREATED',
            'TENANT_UPDATED',
            'TENANT_DELETED',
            'TENANT_SUSPENDED',
            'TENANT_REACTIVATED',
            'TENANT_LOCKED',
            'TENANT_UNLOCKED',
            'SUBSCRIPTION_CHANGED',
            'SUBSCRIPTION_CANCELLED',
            'REFUND_ISSUED',
            'CREDIT_APPLIED',
            'IMPERSONATION_STARTED',
            'IMPERSONATION_ENDED',
            'SUPPORT_CASE_CREATED',
            'TIME_ENTRY_UPDATED',
            'FORCE_PASSWORD_RESET',
            'SESSIONS_REVOKED',
            'SECURITY_POLICY_UPDATED',
            'IP_ALLOWLIST_UPDATED',
            'DATA_EXPORTED',
            'DATA_DELETED',
            'GDPR_REQUEST_PROCESSED',
            'FEATURE_FLAG_UPDATED',
            'RATE_LIMIT_UPDATED',
            'CACHE_CLEARED',
            'PLATFORM_USER_CREATED',
            'PLATFORM_USER_UPDATED',
            'PLATFORM_USER_DELETED',
            'PLATFORM_USER_ROLE_CHANGED'
          );
        END IF;
      END $$;
    `);

    const [{ payouts }] = (await queryRunner.query(`SELECT to_regclass('public.payouts') AS payouts`)) as [
      { payouts: string | null },
    ];

    if (payouts) {
      await queryRunner.query(`
        UPDATE "payouts"
        SET "status" = 'PENDING'
        WHERE "status" IS NOT NULL
          AND "status" NOT IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');
      `);

      await queryRunner.query(`
        UPDATE "payouts"
        SET "currency" = 'USD'
        WHERE "currency" IS NOT NULL
          AND "currency" NOT IN ('USD', 'EUR', 'GBP', 'AED', 'SAR', 'IQD');
      `);

      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'payouts'
              AND column_name = 'status'
              AND udt_name = 'varchar'
          ) THEN
            ALTER TABLE "payouts" ALTER COLUMN "status" DROP DEFAULT;
            ALTER TABLE "payouts"
              ALTER COLUMN "status" TYPE "public"."payouts_status_enum"
              USING "status"::"public"."payouts_status_enum";
            ALTER TABLE "payouts"
              ALTER COLUMN "status" SET DEFAULT 'PENDING'::"public"."payouts_status_enum";
          END IF;
        END $$;
      `);

      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'payouts'
              AND column_name = 'currency'
              AND udt_name = 'varchar'
          ) THEN
            ALTER TABLE "payouts" ALTER COLUMN "currency" DROP DEFAULT;
            ALTER TABLE "payouts"
              ALTER COLUMN "currency" TYPE "public"."currency_enum"
              USING "currency"::"public"."currency_enum";
            ALTER TABLE "payouts"
              ALTER COLUMN "currency" SET DEFAULT 'IQD'::"public"."currency_enum";
          END IF;
        END $$;
      `);
    }

    const [{ transactions }] = (await queryRunner.query(
      `SELECT to_regclass('public.transactions') AS transactions`,
    )) as [{ transactions: string | null }];

    if (transactions) {
      await queryRunner.query(`
        UPDATE "transactions"
        SET "currency" = 'USD'
        WHERE "currency" IS NOT NULL
          AND "currency" NOT IN ('USD', 'EUR', 'GBP', 'AED', 'SAR', 'IQD');
      `);

      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'transactions'
              AND column_name = 'currency'
              AND udt_name = 'varchar'
          ) THEN
            ALTER TABLE "transactions" ALTER COLUMN "currency" DROP DEFAULT;
            ALTER TABLE "transactions"
              ALTER COLUMN "currency" TYPE "public"."currency_enum"
              USING "currency"::"public"."currency_enum";
            ALTER TABLE "transactions"
              ALTER COLUMN "currency" SET DEFAULT 'IQD'::"public"."currency_enum";
          END IF;
        END $$;
      `);
    }

    const [{ platformUsers }] = (await queryRunner.query(
      `SELECT to_regclass('public.platform_users') AS "platformUsers"`,
    )) as [{ platformUsers: string | null }];

    if (platformUsers) {
      await queryRunner.query(`
        UPDATE "platform_users"
        SET "role" = 'ANALYTICS_VIEWER'
        WHERE "role" IS NOT NULL
          AND "role" NOT IN (
            'SUPER_ADMIN',
            'SUPPORT_ADMIN',
            'BILLING_ADMIN',
            'COMPLIANCE_ADMIN',
            'SECURITY_ADMIN',
            'ANALYTICS_VIEWER'
          );
      `);

      await queryRunner.query(`
        UPDATE "platform_users"
        SET "status" = 'active'
        WHERE "status" IS NOT NULL
          AND "status" NOT IN ('active', 'suspended', 'locked');
      `);

      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'platform_users'
              AND column_name = 'role'
              AND udt_name = 'varchar'
          ) THEN
            ALTER TABLE "platform_users" ALTER COLUMN "role" DROP DEFAULT;
            ALTER TABLE "platform_users"
              ALTER COLUMN "role" TYPE "public"."platform_users_role_enum"
              USING "role"::"public"."platform_users_role_enum";
            ALTER TABLE "platform_users"
              ALTER COLUMN "role" SET DEFAULT 'ANALYTICS_VIEWER'::"public"."platform_users_role_enum";
          END IF;
        END $$;
      `);

      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'platform_users'
              AND column_name = 'status'
              AND udt_name = 'varchar'
          ) THEN
            ALTER TABLE "platform_users" ALTER COLUMN "status" DROP DEFAULT;
            ALTER TABLE "platform_users"
              ALTER COLUMN "status" TYPE "public"."platform_users_status_enum"
              USING "status"::"public"."platform_users_status_enum";
            ALTER TABLE "platform_users"
              ALTER COLUMN "status" SET DEFAULT 'active'::"public"."platform_users_status_enum";
          END IF;
        END $$;
      `);
    }

    const [{ platformAuditLogs }] = (await queryRunner.query(
      `SELECT to_regclass('public.platform_audit_logs') AS "platformAuditLogs"`,
    )) as [{ platformAuditLogs: string | null }];

    if (platformAuditLogs) {
      await queryRunner.query(`
        UPDATE "platform_audit_logs"
        SET "action" = 'TENANT_UPDATED'
        WHERE "action" IS NOT NULL
          AND "action" NOT IN (
            'TENANT_CREATED',
            'TENANT_UPDATED',
            'TENANT_DELETED',
            'TENANT_SUSPENDED',
            'TENANT_REACTIVATED',
            'TENANT_LOCKED',
            'TENANT_UNLOCKED',
            'SUBSCRIPTION_CHANGED',
            'SUBSCRIPTION_CANCELLED',
            'REFUND_ISSUED',
            'CREDIT_APPLIED',
            'IMPERSONATION_STARTED',
            'IMPERSONATION_ENDED',
            'SUPPORT_CASE_CREATED',
            'TIME_ENTRY_UPDATED',
            'FORCE_PASSWORD_RESET',
            'SESSIONS_REVOKED',
            'SECURITY_POLICY_UPDATED',
            'IP_ALLOWLIST_UPDATED',
            'DATA_EXPORTED',
            'DATA_DELETED',
            'GDPR_REQUEST_PROCESSED',
            'FEATURE_FLAG_UPDATED',
            'RATE_LIMIT_UPDATED',
            'CACHE_CLEARED',
            'PLATFORM_USER_CREATED',
            'PLATFORM_USER_UPDATED',
            'PLATFORM_USER_DELETED',
            'PLATFORM_USER_ROLE_CHANGED'
          );
      `);

      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'platform_audit_logs'
              AND column_name = 'action'
              AND udt_name = 'varchar'
          ) THEN
            ALTER TABLE "platform_audit_logs"
              ALTER COLUMN "action" TYPE "public"."platform_audit_logs_action_enum"
              USING "action"::"public"."platform_audit_logs_action_enum";
          END IF;
        END $$;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ platformAuditLogs }] = (await queryRunner.query(
      `SELECT to_regclass('public.platform_audit_logs') AS "platformAuditLogs"`,
    )) as [{ platformAuditLogs: string | null }];

    if (platformAuditLogs) {
      await queryRunner.query(`
        ALTER TABLE "platform_audit_logs"
        ALTER COLUMN "action" TYPE varchar(100)
        USING "action"::text;
      `);
    }

    const [{ platformUsers }] = (await queryRunner.query(
      `SELECT to_regclass('public.platform_users') AS "platformUsers"`,
    )) as [{ platformUsers: string | null }];

    if (platformUsers) {
      await queryRunner.query(`
        ALTER TABLE "platform_users"
        ALTER COLUMN "status" TYPE varchar(20)
        USING "status"::text;
      `);
      await queryRunner.query(`
        ALTER TABLE "platform_users"
        ALTER COLUMN "role" TYPE varchar(50)
        USING "role"::text;
      `);
    }

    const [{ transactions }] = (await queryRunner.query(
      `SELECT to_regclass('public.transactions') AS transactions`,
    )) as [{ transactions: string | null }];

    if (transactions) {
      await queryRunner.query(`
        ALTER TABLE "transactions"
        ALTER COLUMN "currency" TYPE character varying
        USING "currency"::text;
      `);
    }

    const [{ payouts }] = (await queryRunner.query(`SELECT to_regclass('public.payouts') AS payouts`)) as [
      { payouts: string | null },
    ];

    if (payouts) {
      await queryRunner.query(`
        ALTER TABLE "payouts"
        ALTER COLUMN "currency" TYPE character varying
        USING "currency"::text;
      `);
      await queryRunner.query(`
        ALTER TABLE "payouts"
        ALTER COLUMN "status" TYPE character varying
        USING "status"::text;
      `);
    }

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."platform_audit_logs_action_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."platform_users_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."platform_users_role_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."payouts_status_enum";`);
  }
}
