import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RuntimeFailure } from '../../common/errors/runtime-failure';

@Injectable()
export class SchemaContractValidatorService implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.validateCriticalContracts();
  }

  private async validateCriticalContracts(): Promise<void> {
    const missingContracts: string[] = [];

    if (!(await this.tableExists('daily_metrics'))) {
      missingContracts.push('relation "daily_metrics"');
    } else {
      await this.collectMissingColumns(
        'daily_metrics',
        [
          'tenant_id',
          'date',
          'total_revenue',
          'bookings_count',
          'tasks_completed_count',
          'active_clients_count',
          'cancellations_count',
        ],
        missingContracts,
      );
    }

    if (!(await this.columnExists('user_preferences', 'tenant_id'))) {
      missingContracts.push('column "user_preferences.tenant_id"');
    }

    if (!(await this.tableExists('notification_preferences'))) {
      missingContracts.push('relation "notification_preferences"');
    } else {
      await this.collectMissingColumns(
        'notification_preferences',
        ['tenant_id', 'user_id', 'notification_type', 'email_enabled', 'in_app_enabled', 'frequency'],
        missingContracts,
      );
    }

    if (missingContracts.length > 0) {
      throw new RuntimeFailure(
        `Schema drift detected during startup: missing required contracts: ${missingContracts.join(', ')}`,
      );
    }
  }

  private async tableExists(tableName: string): Promise<boolean> {
    const resultUnknown: unknown = await this.dataSource.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = $1
        ) AS exists
      `,
      [tableName],
    );

    const result = Array.isArray(resultUnknown) ? (resultUnknown as Array<{ exists?: boolean }>) : [];

    return Boolean(result[0]?.exists);
  }

  private async columnExists(tableName: string, columnName: string): Promise<boolean> {
    const resultUnknown: unknown = await this.dataSource.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = $1
            AND column_name = $2
        ) AS exists
      `,
      [tableName, columnName],
    );

    const result = Array.isArray(resultUnknown) ? (resultUnknown as Array<{ exists?: boolean }>) : [];

    return Boolean(result[0]?.exists);
  }

  private async collectMissingColumns(
    tableName: string,
    requiredColumns: string[],
    missingContracts: string[],
  ): Promise<void> {
    for (const columnName of requiredColumns) {
      if (!(await this.columnExists(tableName, columnName))) {
        missingContracts.push(`column "${tableName}.${columnName}"`);
      }
    }
  }
}
