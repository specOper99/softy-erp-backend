import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repairs partial platform_users tables that existed before CreatePlatformTables
 * ran. That migration skips createTable when the table is already present, so
 * legacy/minimal schemas can miss security and MFA columns expected by PlatformUser.
 */
export class BackfillPlatformUsersColumns20260701000000 implements MigrationInterface {
  name = 'BackfillPlatformUsersColumns20260701000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ platformUsers }] = (await queryRunner.query(
      `SELECT to_regclass('public.platform_users') AS "platformUsers"`,
    )) as [{ platformUsers: string | null }];

    if (!platformUsers) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "platform_users"
        ADD COLUMN IF NOT EXISTS "mfa_enabled" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "mfa_secret" character varying(255),
        ADD COLUMN IF NOT EXISTS "mfa_recovery_codes" json,
        ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "last_login_ip" character varying(45),
        ADD COLUMN IF NOT EXISTS "ip_allowlist" json,
        ADD COLUMN IF NOT EXISTS "trusted_devices" json,
        ADD COLUMN IF NOT EXISTS "failed_login_attempts" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "locked_until" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "must_change_password" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: cannot safely drop columns that may have existed before this migration.
  }
}
