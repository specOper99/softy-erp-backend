import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceGlobalUniqueUserEmail20260125000000 implements MigrationInterface {
  name = 'EnforceGlobalUniqueUserEmail20260125000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const duplicates = (await queryRunner.query(
      `
        SELECT email, COUNT(*)::text AS cnt
        FROM users
        WHERE deleted_at IS NULL
        GROUP BY email
        HAVING COUNT(*) > 1
      `,
    )) as Array<{ email: string; cnt: string }>;

    if (duplicates.length > 0) {
      const sample = duplicates
        .slice(0, 10)
        .map((d) => `${d.email} (count=${d.cnt})`)
        .join(', ');
      throw new Error(`Cannot enforce global-unique emails: duplicates exist. Sample: ${sample}`);
    }

    await queryRunner.query(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN (
          SELECT i.relname AS indexname
          FROM pg_class i
          JOIN pg_index ix ON ix.indexrelid = i.oid
          JOIN pg_class t ON t.oid = ix.indrelid
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
          WHERE t.relname = 'users'
            AND ix.indisunique = true
            AND array_length(ix.indkey, 1) = 1
            AND a.attname = 'email'
        ) LOOP
          EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
        END LOOP;
      END $$;
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_email_unique_active" ON "users" ("email") WHERE deleted_at IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email_unique_active"`);
  }
}
