import type { QueryRunner } from 'typeorm';
import { CreateDailyMetricsTable1771500000000 } from '../../src/database/migrations/1771500000000-CreateDailyMetricsTable';
import { AlignTenantScopedPreferences1771500000001 } from '../../src/database/migrations/1771500000001-AlignTenantScopedPreferences';

describe('incident schema fix migrations', () => {
  it('creates daily_metrics with the expected unique tenant/date index', async () => {
    const actions: Array<[string, ...unknown[]]> = [];
    const queryRunner = {
      hasTable: jest.fn().mockResolvedValue(false),
      createTable: jest.fn().mockImplementation(async (table) => {
        actions.push(['createTable', table.name]);
      }),
      hasColumn: jest.fn(),
      addColumn: jest.fn(),
      getTable: jest.fn().mockResolvedValue({ indices: [] }),
      createIndex: jest.fn().mockImplementation(async (_table, index) => {
        actions.push(['createIndex', index.name, index.columnNames]);
      }),
      dropIndex: jest.fn(),
      dropTable: jest.fn(),
    } as unknown as QueryRunner;

    await new CreateDailyMetricsTable1771500000000().up(queryRunner);

    expect(actions).toEqual([
      ['createTable', 'daily_metrics'],
      ['createIndex', 'IDX_daily_metrics_tenant_date_unique', ['tenant_id', 'date']],
    ]);
  });

  it('backfills tenant scope and creates notification_preferences contracts', async () => {
    const queryCalls: string[] = [];
    const columns = new Set<string>();
    const tables = new Set<string>(['user_preferences']);
    const queryRunner = {
      hasTable: jest.fn().mockImplementation(async (tableName: string) => tables.has(tableName)),
      hasColumn: jest
        .fn()
        .mockImplementation(async (tableName: string, columnName: string) => columns.has(`${tableName}.${columnName}`)),
      addColumn: jest.fn().mockImplementation(async (tableName: string, column) => {
        columns.add(`${tableName}.${column.name}`);
      }),
      query: jest.fn().mockImplementation(async (sql: string) => {
        queryCalls.push(sql.replace(/\s+/g, ' ').trim());
        if (sql.includes('CREATE TABLE "notification_preferences"')) {
          tables.add('notification_preferences');
        }
        if (sql.includes('FROM "user_preferences"')) {
          return [{ count: 0 }];
        }
        if (sql.includes('FROM "notification_preferences"')) {
          return [{ count: 0 }];
        }
        return [];
      }),
      getTable: jest.fn().mockResolvedValue({ foreignKeys: [], indices: [] }),
      createForeignKey: jest.fn(),
      createIndex: jest.fn(),
    } as unknown as QueryRunner;

    await new AlignTenantScopedPreferences1771500000001().up(queryRunner);

    expect(queryCalls.some((sql) => sql.includes('UPDATE "user_preferences" up'))).toBe(true);
    expect(queryCalls.some((sql) => sql.includes('CREATE TABLE "notification_preferences"'))).toBe(true);
    expect(queryCalls.some((sql) => sql.includes('UPDATE "notification_preferences" np'))).toBe(true);
    expect(
      queryCalls.some((sql) =>
        sql.includes('ALTER TABLE "notification_preferences" ALTER COLUMN "tenant_id" SET NOT NULL'),
      ),
    ).toBe(true);
  });
});
