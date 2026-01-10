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
    // Check if clients table exists
    const hasTable = await queryRunner.hasTable('clients');
    if (!hasTable) {
      // Table doesn't exist yet, skip this migration
      return;
    }

    // Check if accessToken column exists
    const hasAccessToken = await queryRunner.hasColumn(
      'clients',
      'accessToken',
    );
    if (!hasAccessToken) {
      // Column doesn't exist yet, skip this migration
      return;
    }

    // Step 1: Drop the old index if it exists (graceful, no error if missing)
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_clients_access_token"
    `);

    // Step 2: Rename column from accessToken to accessTokenHash
    // This invalidates all existing plaintext tokens (security feature)
    await queryRunner
      .query(
        `
      ALTER TABLE "clients"
      RENAME COLUMN "accessToken" TO "accessTokenHash"
    `,
      )
      .catch(() => {
        // Column may already be renamed or not exist - that's OK
      });

    // Step 3: Clear all existing tokens (they were plaintext, now invalid)
    await queryRunner
      .query(
        `
      UPDATE "clients" SET "accessTokenHash" = NULL, "accessTokenExpiry" = NULL
      WHERE "accessTokenHash" IS NOT NULL
    `,
      )
      .catch(() => {
        // Update may fail if columns don't exist - that's OK
      });

    // Step 4: Create new composite index for efficient hash lookups with tenant scoping
    await queryRunner
      .query(
        `
      CREATE INDEX IF NOT EXISTS "idx_clients_tenant_access_token_hash"
      ON "clients" ("tenant_id", "accessTokenHash")
      WHERE "accessTokenHash" IS NOT NULL
    `,
      )
      .catch(() => {
        // Index creation may fail if columns don't exist - that's OK
      });
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
      RENAME COLUMN "accessTokenHash" TO "accessToken"
    `,
      )
      .catch(() => {
        // Column may not exist - that's OK for rollback
      });
  }
}
