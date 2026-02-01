import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expand session_token and refresh_token columns from varchar(255) to text
 * to accommodate JWT tokens which can exceed 255 characters
 */
export class ExpandPlatformSessionTokenColumns1769908893000 implements MigrationInterface {
  name = 'ExpandPlatformSessionTokenColumns1769908893000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Alter session_token from varchar(255) to text
    await queryRunner.query(`ALTER TABLE "platform_sessions" ALTER COLUMN "session_token" TYPE text`);

    // Alter refresh_token from varchar(255) to text
    await queryRunner.query(`ALTER TABLE "platform_sessions" ALTER COLUMN "refresh_token" TYPE text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert refresh_token back to varchar(255)
    // Note: This may fail if any tokens exceed 255 characters
    await queryRunner.query(`ALTER TABLE "platform_sessions" ALTER COLUMN "refresh_token" TYPE varchar(255)`);

    // Revert session_token back to varchar(255)
    // Note: This may fail if any tokens exceed 255 characters
    await queryRunner.query(`ALTER TABLE "platform_sessions" ALTER COLUMN "session_token" TYPE varchar(255)`);
  }
}
