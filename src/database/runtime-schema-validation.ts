import { Client } from 'pg';
import type { DataSource, EntityMetadata } from 'typeorm';
import { RuntimeFailure } from '../common/errors/runtime-failure';
import { assertEnumCompatibility } from './enum-sync';
import { resolveReplicaConnectionConfigs } from './db-config';

export { assertEnumCompatibility } from './enum-sync';

type Queryable = {
  query: (sql: string, parameters?: readonly unknown[]) => Promise<unknown[]>;
};

type SchemaColumnRow = {
  table_schema: string;
  table_name: string;
  column_name: string;
};

export type SchemaExpectation = {
  schema: string;
  table: string;
  columns: string[];
};

type ReplicaTarget = {
  label: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
};

// Deferred until subscriptions table split — see docs/SUBSCRIPTIONS_ARCHITECTURE.md
const SCHEMA_VALIDATION_EXCLUDED_TABLES = new Set(['subscriptions']);

function getTableKey(schema: string, table: string): string {
  return `${schema}.${table}`;
}

function formatTableName(schema: string, table: string): string {
  return schema === 'public' ? table : `${schema}.${table}`;
}

function buildReplicaTargets(): ReplicaTarget[] {
  return resolveReplicaConnectionConfigs().map((config, index) => ({
    label: `replica ${index + 1} (${config.host}:${config.port})`,
    host: config.host ?? '',
    port: config.port,
    username: config.username ?? '',
    password: config.password ?? '',
    database: config.database ?? '',
  }));
}

export function collectExpectedSchema(entityMetadatas: readonly EntityMetadata[]): SchemaExpectation[] {
  const tableColumns = new Map<string, Set<string>>();

  for (const metadata of entityMetadatas) {
    if (metadata.tableType === 'view') {
      continue;
    }

    const schema = metadata.schema ?? 'public';
    const table = metadata.tableName;
    if (!table || SCHEMA_VALIDATION_EXCLUDED_TABLES.has(table)) {
      continue;
    }

    const tableKey = getTableKey(schema, table);
    const columns = tableColumns.get(tableKey) ?? new Set<string>();
    for (const column of metadata.columns) {
      if (!column.isVirtualProperty) {
        columns.add(column.databaseName);
      }
    }

    if (columns.size > 0) {
      tableColumns.set(tableKey, columns);
    }
  }

  return Array.from(tableColumns.entries())
    .map(([tableKey, columns]) => {
      const separatorIndex = tableKey.indexOf('.');
      const schema = tableKey.slice(0, separatorIndex);
      const table = tableKey.slice(separatorIndex + 1);
      return {
        schema,
        table,
        columns: Array.from(columns).sort(),
      };
    })
    .sort((left, right) => getTableKey(left.schema, left.table).localeCompare(getTableKey(right.schema, right.table)));
}

async function loadActualSchema(queryable: Queryable): Promise<Map<string, Set<string>>> {
  const rows = (await queryable.query(`
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
    ORDER BY table_schema, table_name, ordinal_position
  `)) as SchemaColumnRow[];

  const columnsByTable = new Map<string, Set<string>>();
  for (const row of rows) {
    const tableKey = getTableKey(row.table_schema, row.table_name);
    const columns = columnsByTable.get(tableKey) ?? new Set<string>();
    columns.add(row.column_name);
    columnsByTable.set(tableKey, columns);
  }

  return columnsByTable;
}

export function findMissingSchemaColumns(
  expectedSchema: readonly SchemaExpectation[],
  actualSchema: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  const missing: string[] = [];

  for (const expectedTable of expectedSchema) {
    const tableKey = getTableKey(expectedTable.schema, expectedTable.table);
    const actualColumns = actualSchema.get(tableKey);

    if (!actualColumns) {
      missing.push(`${formatTableName(expectedTable.schema, expectedTable.table)} (table missing)`);
      continue;
    }

    for (const column of expectedTable.columns) {
      if (!actualColumns.has(column)) {
        missing.push(`${formatTableName(expectedTable.schema, expectedTable.table)}.${column}`);
      }
    }
  }

  return missing;
}

function formatMissingColumns(missing: readonly string[]): string {
  if (missing.length <= 8) {
    return missing.join(', ');
  }

  const preview = missing.slice(0, 8).join(', ');
  return `${preview}, and ${missing.length - 8} more`;
}

async function assertQueryableSchemaMatches(
  queryable: Queryable,
  label: string,
  expectedSchema: readonly SchemaExpectation[],
): Promise<void> {
  const actualSchema = await loadActualSchema(queryable);
  const missing = findMissingSchemaColumns(expectedSchema, actualSchema);

  if (missing.length > 0) {
    throw new RuntimeFailure(
      `Database schema mismatch on ${label}: missing ${formatMissingColumns(missing)}. Run migrations and ensure all read replicas are caught up before serving traffic.`,
    );
  }
}

export async function assertRuntimeSchemaCompatibility(dataSource: DataSource): Promise<void> {
  const expectedSchema = collectExpectedSchema(dataSource.entityMetadatas);

  const masterQueryRunner = dataSource.createQueryRunner('master');
  try {
    await masterQueryRunner.connect();
    const masterQueryable = {
      query: (sql: string, parameters?: readonly unknown[]) =>
        masterQueryRunner.query(sql, parameters as unknown[] | undefined) as Promise<unknown[]>,
    };
    await assertQueryableSchemaMatches(masterQueryable, 'master', expectedSchema);
    await assertEnumCompatibility(dataSource.entityMetadatas, masterQueryable, 'master');
  } finally {
    await masterQueryRunner.release();
  }

  for (const replicaTarget of buildReplicaTargets()) {
    const client = new Client({
      host: replicaTarget.host,
      port: replicaTarget.port,
      user: replicaTarget.username,
      password: replicaTarget.password,
      database: replicaTarget.database,
    });

    try {
      await client.connect();
      await assertQueryableSchemaMatches(client, replicaTarget.label, expectedSchema);
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}
