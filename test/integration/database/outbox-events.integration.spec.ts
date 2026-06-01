import type { DataSource } from 'typeorm';
import { createTestDataSource } from '../../utils/create-test-datasource';

describe('Migrations: outbox_events', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = createTestDataSource();
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('creates outbox_events table', async () => {
    const result = await dataSource.query(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = 'outbox_events'
       ) AS exists`,
    );

    expect(result[0]?.exists).toBe(true);
  });
});
