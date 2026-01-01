import { MigrationInterface, QueryRunner } from 'typeorm';

export class GlobalUniqueUserEmail1767273600000 implements MigrationInterface {
  name = 'GlobalUniqueUserEmail1767273600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Guardrail: if duplicates exist, this migration would fail anyway;
    // we fail early with a clear message.
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
      throw new Error(
        `Cannot enforce global-unique emails: duplicates exist. Sample: ${sample}`,
      );
    }

    // Drop any unique composite indexes on (email, tenant_id)
    // (historically created with different names across migrations).
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
            AND indexdef ILIKE '%("email", "tenant_id")%'
        ) LOOP
          EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
        END LOOP;
      END $$;
    `);

    // Create new unique index on email
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_email_unique" ON "users" ("email")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email_unique"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_email_tenant" ON "users" ("email", "tenant_id")`,
    );
  }
}
