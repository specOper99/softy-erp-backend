import type { DataSource } from 'typeorm';
import { SchemaContractValidatorService } from './schema-contract-validator.service';

describe('SchemaContractValidatorService', () => {
  let service: SchemaContractValidatorService;
  let mockDataSource: { query: jest.Mock };

  beforeEach(() => {
    mockDataSource = {
      query: jest.fn(),
    };

    service = new SchemaContractValidatorService(mockDataSource as unknown as DataSource);
  });

  it('passes startup validation when all critical schema contracts exist', async () => {
    mockDataSource.query.mockResolvedValue([{ exists: true }]);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(mockDataSource.query).toHaveBeenCalled();
  });

  it('fails startup validation with explicit missing contract details', async () => {
    mockDataSource.query.mockImplementation(async (_sql: string, params?: string[]) => {
      const [tableName, columnName] = params ?? [];

      if (tableName === 'daily_metrics' && !columnName) {
        return [{ exists: false }];
      }

      if (tableName === 'user_preferences' && columnName === 'tenant_id') {
        return [{ exists: false }];
      }

      return [{ exists: true }];
    });

    await expect(service.onModuleInit()).rejects.toThrow(
      'Schema drift detected during startup: missing required contracts: relation "daily_metrics", column "user_preferences.tenant_id"',
    );
  });

  it('fails startup validation when required daily_metrics columns are missing', async () => {
    mockDataSource.query.mockImplementation(async (_sql: string, params?: string[]) => {
      const [tableName, columnName] = params ?? [];

      if (tableName === 'daily_metrics' && columnName === 'tenant_id') {
        return [{ exists: false }];
      }

      return [{ exists: true }];
    });

    await expect(service.onModuleInit()).rejects.toThrow(
      'Schema drift detected during startup: missing required contracts: column "daily_metrics.tenant_id"',
    );
  });
});
