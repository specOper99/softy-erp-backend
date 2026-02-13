import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class HardenImpersonationSessionTokenStorage1770700000002 implements MigrationInterface {
  name = 'HardenImpersonationSessionTokenStorage1770700000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('impersonation_sessions')) {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

      if (!(await queryRunner.hasColumn('impersonation_sessions', 'session_token_hash'))) {
        await queryRunner.addColumn(
          'impersonation_sessions',
          new TableColumn({
            name: 'session_token_hash',
            type: 'varchar',
            length: '64',
            isNullable: true,
          }),
        );
      }

      await queryRunner.query(`
        UPDATE "impersonation_sessions"
        SET "session_token_hash" = encode(digest("session_token", 'sha256'), 'hex')
        WHERE "session_token" IS NOT NULL
          AND "session_token" <> ''
          AND ("session_token_hash" IS NULL OR "session_token_hash" = '')
      `);

      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "IDX_impersonation_sessions_session_token_hash"
        ON "impersonation_sessions" ("session_token_hash")
      `);

      if (await queryRunner.hasColumn('impersonation_sessions', 'session_token')) {
        await queryRunner.dropColumn('impersonation_sessions', 'session_token');
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('impersonation_sessions')) {
      if (!(await queryRunner.hasColumn('impersonation_sessions', 'session_token'))) {
        await queryRunner.addColumn(
          'impersonation_sessions',
          new TableColumn({
            name: 'session_token',
            type: 'varchar',
            length: '255',
            isNullable: true,
          }),
        );
      }

      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_impersonation_sessions_session_token_hash"`);

      if (await queryRunner.hasColumn('impersonation_sessions', 'session_token_hash')) {
        await queryRunner.dropColumn('impersonation_sessions', 'session_token_hash');
      }
    }
  }
}
