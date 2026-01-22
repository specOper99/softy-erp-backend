import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddClientAuthFields1767600000000 implements MigrationInterface {
  name = 'AddClientAuthFields1767600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if clients table exists first (TypeORM synchronization may not have run yet)
    const hasTable = await queryRunner.hasTable('clients');
    if (!hasTable) {
      // Table will be created by synchronization with the new columns
      return;
    }

    const hasAccessTokenHash = await queryRunner.hasColumn('clients', 'access_token_hash');
    if (!hasAccessTokenHash) {
      await queryRunner.addColumn(
        'clients',
        new TableColumn({
          name: 'access_token_hash',
          type: 'varchar',
          length: '64',
          isNullable: true,
        }),
      );
    }

    // Add accessTokenExpiry column if it doesn't exist
    const hasTokenExpiry = await queryRunner.hasColumn('clients', 'accessTokenExpiry');
    if (!hasTokenExpiry) {
      await queryRunner.addColumn(
        'clients',
        new TableColumn({
          name: 'accessTokenExpiry',
          type: 'timestamptz',
          isNullable: true,
        }),
      );
    }

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_clients_tenant_access_token_hash"
      ON "clients" ("tenant_id", "access_token_hash")
      WHERE "access_token_hash" IS NOT NULL
    `);

    const hasLegacyAccessTokenHash = await queryRunner.hasColumn('clients', 'accessTokenHash');
    if (hasLegacyAccessTokenHash && hasAccessTokenHash) {
      await queryRunner.dropColumn('clients', 'accessTokenHash');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('clients');
    if (!hasTable) return;

    const hasAccessToken = await queryRunner.hasColumn('clients', 'accessToken');
    if (hasAccessToken) {
      await queryRunner.dropColumn('clients', 'accessToken');
    }

    const hasAccessTokenHash = await queryRunner.hasColumn('clients', 'access_token_hash');
    if (hasAccessTokenHash) {
      await queryRunner.dropColumn('clients', 'access_token_hash');
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_clients_tenant_access_token_hash"`);

    const hasTokenExpiry = await queryRunner.hasColumn('clients', 'accessTokenExpiry');
    if (hasTokenExpiry) {
      await queryRunner.dropColumn('clients', 'accessTokenExpiry');
    }
  }
}
