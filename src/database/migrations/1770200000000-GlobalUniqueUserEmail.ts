import { MigrationInterface, QueryRunner } from 'typeorm';

export class GlobalUniqueUserEmail1770200000000 implements MigrationInterface {
  name = 'GlobalUniqueUserEmail1770200000000';

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

    // Drop any unique composite indexes on (tenant_id, email)
    await queryRunner.query(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN (
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'users'
            AND indexdef ILIKE '%UNIQUE%'
            AND indexdef ILIKE '%("tenant_id", "email")%'
        ) LOOP
          EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
        END LOOP;
      END $$;
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_email_unique" ON "users" ("email")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email_unique"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_tenant_email" ON "users" ("tenant_id", "email")`,
    );
  }
}
