import { DataSource } from 'typeorm';

type ConstraintExpectation = {
  constraintName: string;
  tableName: string;
  referencedTableName: string;
  childColumns: string[];
  parentColumns: string[];
};

describe('Migrations: tenant integrity constraints', () => {
  let dataSource: DataSource;

  const expectedConstraints: ConstraintExpectation[] = [
    {
      constraintName: 'FK_booking_client_composite',
      tableName: 'bookings',
      referencedTableName: 'clients',
      childColumns: ['client_id', 'tenant_id'],
      parentColumns: ['id', 'tenant_id'],
    },
    {
      constraintName: 'FK_invoice_booking_composite',
      tableName: 'invoices',
      referencedTableName: 'bookings',
      childColumns: ['booking_id', 'tenant_id'],
      parentColumns: ['id', 'tenant_id'],
    },
    {
      constraintName: 'FK_time_entry_task_composite',
      tableName: 'time_entries',
      referencedTableName: 'tasks',
      childColumns: ['task_id', 'tenant_id'],
      parentColumns: ['id', 'tenant_id'],
    },
    {
      constraintName: 'FK_webhook_delivery_webhook_composite',
      tableName: 'webhook_deliveries',
      referencedTableName: 'webhooks',
      childColumns: ['tenant_id', 'webhook_id'],
      parentColumns: ['id', 'tenant_id'],
    },
  ];

  beforeAll(async () => {
    const dbConfig = globalThis.__DB_CONFIG__!;
    dataSource = new DataSource({
      type: 'postgres',
      host: dbConfig.host,
      port: dbConfig.port,
      username: dbConfig.username,
      password: dbConfig.password,
      database: dbConfig.database,
      entities: [__dirname + '/../../../src/**/*.entity.ts'],
      synchronize: false,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  const sortColumns = (rows: Array<{ column_name: string }>): string[] =>
    rows.map((row) => row.column_name).sort((a, b) => a.localeCompare(b));

  it('creates composite tenant FK constraints for core relations', async () => {
    for (const expected of expectedConstraints) {
      const metadataRows = (await dataSource.query(
        `
          SELECT
            tc.constraint_name,
            tc.table_name,
            ccu.table_name AS referenced_table_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_schema = ccu.constraint_schema
           AND tc.constraint_name = ccu.constraint_name
          WHERE tc.constraint_schema = 'public'
            AND tc.constraint_type = 'FOREIGN KEY'
            AND tc.constraint_name = $1
            AND tc.table_name = $2
            AND ccu.table_name = $3
          LIMIT 1
        `,
        [expected.constraintName, expected.tableName, expected.referencedTableName],
      )) as Array<{
        constraint_name: string;
        table_name: string;
        referenced_table_name: string;
      }>;

      expect(metadataRows).toHaveLength(1);

      const childColumnRows = (await dataSource.query(
        `
          SELECT kcu.column_name
          FROM information_schema.key_column_usage kcu
          WHERE kcu.constraint_schema = 'public'
            AND kcu.constraint_name = $1
            AND kcu.table_name = $2
        `,
        [expected.constraintName, expected.tableName],
      )) as Array<{ column_name: string }>;

      const parentColumnRows = (await dataSource.query(
        `
          SELECT parent_column.attname AS column_name
          FROM pg_constraint c
          JOIN pg_class child_table ON child_table.oid = c.conrelid
          JOIN pg_class parent_table ON parent_table.oid = c.confrelid
          JOIN unnest(c.confkey) WITH ORDINALITY AS parent_key(attnum, ordinality) ON TRUE
          JOIN pg_attribute parent_column
            ON parent_column.attrelid = parent_table.oid
           AND parent_column.attnum = parent_key.attnum
          WHERE c.conname = $1
            AND c.contype = 'f'
            AND child_table.relname = $2
            AND parent_table.relname = $3
          ORDER BY parent_key.ordinality
        `,
        [expected.constraintName, expected.tableName, expected.referencedTableName],
      )) as Array<{ column_name: string }>;

      expect(sortColumns(childColumnRows)).toEqual([...expected.childColumns].sort((a, b) => a.localeCompare(b)));
      expect(sortColumns(parentColumnRows)).toEqual([...expected.parentColumns].sort((a, b) => a.localeCompare(b)));
    }
  });
});
