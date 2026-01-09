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

    // Add accessToken column if it doesn't exist
    const hasAccessToken = await queryRunner.hasColumn(
      'clients',
      'accessToken',
    );
    if (!hasAccessToken) {
      await queryRunner.addColumn(
        'clients',
        new TableColumn({
          name: 'accessToken',
          type: 'varchar',
          isNullable: true,
        }),
      );
    }

    // Add accessTokenExpiry column if it doesn't exist
    const hasTokenExpiry = await queryRunner.hasColumn(
      'clients',
      'accessTokenExpiry',
    );
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('clients');
    if (!hasTable) return;

    const hasAccessToken = await queryRunner.hasColumn(
      'clients',
      'accessToken',
    );
    if (hasAccessToken) {
      await queryRunner.dropColumn('clients', 'accessToken');
    }

    const hasTokenExpiry = await queryRunner.hasColumn(
      'clients',
      'accessTokenExpiry',
    );
    if (hasTokenExpiry) {
      await queryRunner.dropColumn('clients', 'accessTokenExpiry');
    }
  }
}
