import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SECURITY: Rename access_token to access_token_hash
 *
 * This migration supports the security fix that changes magic link token storage
 * from plaintext to SHA-256 hash. Existing tokens will be invalidated.
 *
 * Breaking change: Clients with active magic links must request new ones.
 */
export class RenameAccessTokenToHash1736469350000 implements MigrationInterface {
  name = 'RenameAccessTokenToHash1736469350000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Drop the old index if it exists (graceful, no error if missing)
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_clients_access_token"
    `);

    // Step 2: Rename column from access_token to access_token_hash
    // This invalidates all existing plaintext tokens (security feature)
    await queryRunner
      .query(
        `
      ALTER TABLE "clients"
      RENAME COLUMN "access_token" TO "access_token_hash"
    `,
      )
      .catch(() => {
        // Column may already be renamed or not exist - that's OK
      });

    // Step 3: Clear all existing tokens (they were plaintext, now invalid)
    await queryRunner.query(`
      UPDATE "clients" SET "access_token_hash" = NULL, "access_token_expiry" = NULL
      WHERE "access_token_hash" IS NOT NULL
    `);

    // Step 4: Create new composite index for efficient hash lookups with tenant scoping
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_clients_tenant_access_token_hash"
      ON "clients" ("tenant_id", "access_token_hash")
      WHERE "access_token_hash" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Drop the new index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_clients_tenant_access_token_hash"
    `);

    // Step 2: Rename column back
    await queryRunner
      .query(
        `
      ALTER TABLE "clients"
      RENAME COLUMN "access_token_hash" TO "access_token"
    `,
      )
      .catch(() => {
        // Column may not exist - that's OK for rollback
      });
  }
}
