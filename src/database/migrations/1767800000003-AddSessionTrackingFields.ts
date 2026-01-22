import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionTrackingFields1767800000003 implements MigrationInterface {
  name = 'AddSessionTrackingFields1767800000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
      ADD COLUMN IF NOT EXISTS "device_name" character varying,
      ADD COLUMN IF NOT EXISTS "location" character varying,
      ADD COLUMN IF NOT EXISTS "last_ip_address" character varying(45),
      ADD COLUMN IF NOT EXISTS "ip_changed" boolean DEFAULT false
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_last_used" 
      ON "refresh_tokens" ("user_id", "last_used_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_refresh_tokens_last_used"`);
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
      DROP COLUMN IF EXISTS "ip_changed",
      DROP COLUMN IF EXISTS "last_ip_address",
      DROP COLUMN IF EXISTS "location",
      DROP COLUMN IF EXISTS "device_name"
    `);
  }
}
