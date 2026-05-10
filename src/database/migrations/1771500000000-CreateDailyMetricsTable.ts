import type { MigrationInterface, QueryRunner } from 'typeorm';
import { Table, TableColumn, TableIndex } from 'typeorm';

export class CreateDailyMetricsTable1771500000000 implements MigrationInterface {
  name = 'CreateDailyMetricsTable1771500000000';

  private readonly tableName = 'daily_metrics';

  private getRequiredColumns(): TableColumn[] {
    return [
      new TableColumn({
        name: 'id',
        type: 'uuid',
        isPrimary: true,
        generationStrategy: 'uuid',
        default: 'uuid_generate_v4()',
      }),
      new TableColumn({
        name: 'tenant_id',
        type: 'uuid',
        isNullable: false,
      }),
      new TableColumn({
        name: 'date',
        type: 'date',
        isNullable: false,
      }),
      new TableColumn({
        name: 'total_revenue',
        type: 'decimal',
        precision: 12,
        scale: 2,
        default: 0,
        isNullable: false,
      }),
      new TableColumn({
        name: 'bookings_count',
        type: 'int',
        default: 0,
        isNullable: false,
      }),
      new TableColumn({
        name: 'tasks_completed_count',
        type: 'int',
        default: 0,
        isNullable: false,
      }),
      new TableColumn({
        name: 'active_clients_count',
        type: 'int',
        default: 0,
        isNullable: false,
      }),
      new TableColumn({
        name: 'cancellations_count',
        type: 'int',
        default: 0,
        isNullable: false,
      }),
      new TableColumn({
        name: 'created_at',
        type: 'timestamptz',
        default: 'now()',
        isNullable: false,
      }),
      new TableColumn({
        name: 'updated_at',
        type: 'timestamptz',
        default: 'now()',
        isNullable: false,
      }),
    ];
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasDailyMetricsTable = await queryRunner.hasTable(this.tableName);

    if (!hasDailyMetricsTable) {
      await queryRunner.createTable(
        new Table({
          name: this.tableName,
          columns: this.getRequiredColumns(),
        }),
      );
    } else {
      for (const column of this.getRequiredColumns()) {
        const hasColumn = await queryRunner.hasColumn(this.tableName, column.name);
        if (!hasColumn) {
          await queryRunner.addColumn(this.tableName, column);
        }
      }
    }

    const table = await queryRunner.getTable(this.tableName);
    const uniqueTenantDateIndexName = 'IDX_daily_metrics_tenant_date_unique';
    const hasUniqueTenantDateIndex =
      table?.indices.some((index) => {
        const hasTenantAndDateColumns =
          index.columnNames.length === 2 &&
          index.columnNames.includes('tenant_id') &&
          index.columnNames.includes('date');
        return index.name === uniqueTenantDateIndexName || (index.isUnique && hasTenantAndDateColumns);
      }) ?? false;

    if (!hasUniqueTenantDateIndex) {
      await queryRunner.createIndex(
        this.tableName,
        new TableIndex({
          name: uniqueTenantDateIndexName,
          columnNames: ['tenant_id', 'date'],
          isUnique: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable(this.tableName))) {
      return;
    }

    const table = await queryRunner.getTable(this.tableName);
    if (table?.indices.some((index) => index.name === 'IDX_daily_metrics_tenant_date_unique')) {
      await queryRunner.dropIndex(this.tableName, 'IDX_daily_metrics_tenant_date_unique');
    }

    await queryRunner.dropTable(this.tableName);
  }
}
