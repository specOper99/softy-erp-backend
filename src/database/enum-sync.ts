import type { EntityMetadata } from 'typeorm';
import { RuntimeFailure } from '../common/errors/runtime-failure';

type Queryable = {
  query: (sql: string, parameters?: readonly unknown[]) => Promise<unknown[]>;
};

type PgEnumRow = {
  enum_name: string;
  enum_label: string;
};

export type EnumExpectation = {
  table: string;
  column: string;
  pgEnumName: string;
  tsValues: readonly string[];
};

const PG_ENUM_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  'bookings.payment_status': 'payment_status_enum',
  'tenants.base_currency': 'currency_enum',
  'tenants.subscriptionPlan': 'tenants_subscriptionplan_enum',
  'payouts.currency': 'currency_enum',
  'transactions.currency': 'currency_enum',
  'recurring_transactions.type': 'transactions_type_enum',
  'recurring_transactions.currency': 'currency_enum',
  'task_templates.default_status': 'tasks_status_enum',
  'transaction_categories.applicableType': 'transactions_type_enum',
};

// Deferred until subscriptions table split — see docs/SUBSCRIPTIONS_ARCHITECTURE.md
const ENUM_SYNC_EXCLUDED_TABLES = new Set(['subscriptions']);

export function extractEnumStringValues(enumObject: object): string[] {
  return Object.values(enumObject).filter((value): value is string => typeof value === 'string');
}

export function resolvePgEnumName(tableName: string, columnName: string, explicitEnumName?: string): string {
  if (explicitEnumName) {
    return explicitEnumName;
  }

  const overrideKey = `${tableName}.${columnName}`;
  return PG_ENUM_NAME_OVERRIDES[overrideKey] ?? `${tableName}_${columnName}_enum`;
}

function lookupPgEnumLabels(
  pgEnumName: string,
  pgLabelsByEnumName: ReadonlyMap<string, ReadonlySet<string>>,
): { labels: ReadonlySet<string>; resolvedName: string } | undefined {
  const direct = pgLabelsByEnumName.get(pgEnumName);
  if (direct) {
    return { labels: direct, resolvedName: pgEnumName };
  }

  const lowerName = pgEnumName.toLowerCase();
  const lowered = pgLabelsByEnumName.get(lowerName);
  if (lowered) {
    return { labels: lowered, resolvedName: lowerName };
  }

  return undefined;
}

export function collectEnumExpectations(entityMetadatas: readonly EntityMetadata[]): EnumExpectation[] {
  const expectations: EnumExpectation[] = [];

  for (const metadata of entityMetadatas) {
    if (metadata.tableType === 'view') {
      continue;
    }

    const tableName = metadata.tableName;
    if (!tableName || ENUM_SYNC_EXCLUDED_TABLES.has(tableName)) {
      continue;
    }

    for (const column of metadata.columns) {
      if (!column.enum) {
        continue;
      }

      const tsValues = extractEnumStringValues(column.enum);
      if (tsValues.length === 0) {
        continue;
      }

      expectations.push({
        table: tableName,
        column: column.databaseName,
        pgEnumName: resolvePgEnumName(tableName, column.databaseName, column.enumName),
        tsValues: tsValues.sort(),
      });
    }
  }

  return expectations.sort((left, right) => {
    const leftKey = `${left.table}.${left.column}`;
    const rightKey = `${right.table}.${right.column}`;
    return leftKey.localeCompare(rightKey);
  });
}

export function findMissingEnumLabels(
  expectations: readonly EnumExpectation[],
  pgLabelsByEnumName: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  const missing: string[] = [];

  for (const expectation of expectations) {
    const pgEnum = lookupPgEnumLabels(expectation.pgEnumName, pgLabelsByEnumName);
    if (!pgEnum) {
      missing.push(`${expectation.table}.${expectation.column}: PostgreSQL enum "${expectation.pgEnumName}" not found`);
      continue;
    }

    for (const tsValue of expectation.tsValues) {
      if (!pgEnum.labels.has(tsValue)) {
        missing.push(
          `${expectation.table}.${expectation.column}: TS value "${tsValue}" missing from PostgreSQL enum "${pgEnum.resolvedName}"`,
        );
      }
    }
  }

  return missing;
}

export async function loadPgEnumLabels(queryable: Queryable): Promise<Map<string, Set<string>>> {
  const rows = (await queryable.query(`
    SELECT t.typname AS enum_name, e.enumlabel AS enum_label
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder
  `)) as PgEnumRow[];

  const labelsByEnumName = new Map<string, Set<string>>();
  for (const row of rows) {
    const labels = labelsByEnumName.get(row.enum_name) ?? new Set<string>();
    labels.add(row.enum_label);
    labelsByEnumName.set(row.enum_name, labels);
  }

  return labelsByEnumName;
}

export async function assertEnumCompatibility(
  entityMetadatas: readonly EntityMetadata[],
  queryable: Queryable,
  label = 'database',
): Promise<void> {
  const expectations = collectEnumExpectations(entityMetadatas);
  const pgLabelsByEnumName = await loadPgEnumLabels(queryable);
  const missing = findMissingEnumLabels(expectations, pgLabelsByEnumName);

  if (missing.length > 0) {
    const preview =
      missing.length <= 8 ? missing.join('; ') : `${missing.slice(0, 8).join('; ')}; and ${missing.length - 8} more`;
    throw new RuntimeFailure(
      `Enum schema mismatch on ${label}: ${preview}. Add a migration for missing PostgreSQL enum labels before deploying.`,
    );
  }
}
