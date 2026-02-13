import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceImpersonationTokenHashNotNull1770700000004 implements MigrationInterface {
  name = 'EnforceImpersonationTokenHashNotNull1770700000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('impersonation_sessions')) {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

      await queryRunner.query(`
        UPDATE "impersonation_sessions"
        SET "session_token_hash" = encode(digest("id"::text, 'sha256'), 'hex')
        WHERE "session_token_hash" IS NULL OR "session_token_hash" = ''
      `);

      await queryRunner.query(`
        ALTER TABLE "impersonation_sessions"
        ALTER COLUMN "session_token_hash" SET NOT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('impersonation_sessions')) {
      await queryRunner.query(`
        ALTER TABLE "impersonation_sessions"
        ALTER COLUMN "session_token_hash" DROP NOT NULL
      `);
    }
  }
}
