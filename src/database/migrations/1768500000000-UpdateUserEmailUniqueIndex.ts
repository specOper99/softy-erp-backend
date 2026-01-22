import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adjusts email uniqueness to be tenant-scoped.
 * - Drops existing unique index on users(email)
 * - Adds non-unique index on users(email)
 * - Adds unique composite index on users(tenant_id, email)
 */
export class UpdateUserEmailUniqueIndex1768500000000 implements MigrationInterface {
  name = 'UpdateUserEmailUniqueIndex1768500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop any existing unique index on users(email)
    await queryRunner.query(`
      DO $$
      DECLARE
        idxname text;
      BEGIN
        SELECT i.relname INTO idxname
        FROM pg_class i
        JOIN pg_index ix ON ix.indexrelid = i.oid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        WHERE t.relname = 'users'
          AND ix.indisunique = true
          AND array_length(ix.indkey, 1) = 1
          AND a.attname = 'email'
        LIMIT 1;

        IF idxname IS NOT NULL THEN
          EXECUTE format('DROP INDEX IF EXISTS %I', idxname);
        END IF;
      END $$;
    `);

    // Non-unique index for lookup by email
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `);

    // Unique composite index for tenant-scoped email
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_users_tenant_email
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_users_email
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email)
    `);
  }
}
