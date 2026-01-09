import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
} from 'typeorm';

export class SyncTenantSchema1767700000004 implements MigrationInterface {
  name = 'SyncTenantSchema1767700000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('tenants', [
      new TableColumn({
        name: 'default_tax_rate',
        type: 'decimal',
        precision: 5,
        scale: 2,
        default: 15.0,
      }),
      new TableColumn({
        name: 'cancellation_policy_days',
        type: 'jsonb',
        default:
          '\'[{"daysBeforeEvent": 7, "refundPercentage": 100}, {"daysBeforeEvent": 0, "refundPercentage": 0}]\'',
      }),
      new TableColumn({
        name: 'quotas',
        type: 'jsonb',
        default: "'{}'",
        comment: 'Resource quotas (e.g. max_users: 10, max_storage_gb: 5)',
      }),
      new TableColumn({
        name: 'parent_tenant_id',
        type: 'uuid',
        isNullable: true,
      }),
    ]);

    await queryRunner.createForeignKey(
      'tenants',
      new TableForeignKey({
        columnNames: ['parent_tenant_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'tenants',
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('tenants');
    if (table) {
      const foreignKey = table.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('parent_tenant_id') !== -1,
      );
      if (foreignKey) {
        await queryRunner.dropForeignKey('tenants', foreignKey);
      }
    }
    await queryRunner.dropColumn('tenants', 'parent_tenant_id');
    await queryRunner.dropColumn('tenants', 'quotas');
    await queryRunner.dropColumn('tenants', 'cancellation_policy_days');
    await queryRunner.dropColumn('tenants', 'default_tax_rate');
  }
}
