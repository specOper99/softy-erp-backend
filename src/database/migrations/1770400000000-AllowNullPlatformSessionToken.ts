import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowNullPlatformSessionToken1770400000000 implements MigrationInterface {
  name = 'AllowNullPlatformSessionToken1770400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "platform_sessions" ALTER COLUMN "session_token" DROP NOT NULL`);
    await queryRunner.query(`UPDATE "platform_sessions" SET "session_token" = NULL WHERE "session_token" = ''`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "platform_sessions"
       SET "session_token" = 'pending:' || "id"::text
       WHERE "session_token" IS NULL OR "session_token" = ''`,
    );
    await queryRunner.query(`ALTER TABLE "platform_sessions" ALTER COLUMN "session_token" SET NOT NULL`);
  }
}
