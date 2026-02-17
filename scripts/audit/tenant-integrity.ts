import * as fs from 'node:fs';
import * as path from 'node:path';
import { inspect } from 'node:util';
import dataSource from '../../src/database/data-source';

const REPORT_FILE_NAME = 'tenant-integrity-report.json';

interface ForeignKeyCheckConfig {
  checkName: string;
  childEntity: string;
  parentEntity: string;
  relationProperty: string;
}

interface TenantScopedEntityEntry {
  entityName: string;
  tableName: string;
  tenantColumn: string;
}

interface NullTenantViolationEntry extends TenantScopedEntityEntry {
  nullTenantCount: number;
}

interface CrossTenantViolationEntry {
  checkName: string;
  childEntity: string;
  childTable: string;
  childForeignKeyColumn: string;
  parentEntity: string;
  parentTable: string;
  parentPrimaryKeyColumn: string;
  mismatchCount: number;
}

const FK_CHECKS: ForeignKeyCheckConfig[] = [
  {
    checkName: 'booking.client -> client.id',
    childEntity: 'Booking',
    parentEntity: 'Client',
    relationProperty: 'client',
  },
  {
    checkName: 'task.booking -> booking.id',
    childEntity: 'Task',
    parentEntity: 'Booking',
    relationProperty: 'booking',
  },
  {
    checkName: 'timeEntry.task -> task.id',
    childEntity: 'TimeEntry',
    parentEntity: 'Task',
    relationProperty: 'task',
  },
  {
    checkName: 'invoice.booking -> booking.id',
    childEntity: 'Invoice',
    parentEntity: 'Booking',
    relationProperty: 'booking',
  },
  {
    checkName: 'webhookDelivery.webhook -> webhook.id',
    childEntity: 'WebhookDelivery',
    parentEntity: 'Webhook',
    relationProperty: 'webhook',
  },
];

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteTablePath(tablePath: string): string {
  return tablePath
    .split('.')
    .map((segment) => quoteIdentifier(segment))
    .join('.');
}

function getCount(rawCount: unknown): number {
  if (typeof rawCount === 'number') {
    return rawCount;
  }

  if (typeof rawCount === 'string') {
    return Number(rawCount);
  }

  throw new Error(`Unable to parse count value: ${String(rawCount)}`);
}

function getMetadataByName(entityName: string) {
  const metadata = dataSource.entityMetadatas.find((entry) => entry.name === entityName);
  if (!metadata) {
    throw new Error(`Entity metadata not found for "${entityName}".`);
  }
  return metadata;
}

function getTenantColumnName(metadata: {
  columns: Array<{ propertyName: string; databaseName: string }>;
}): string | null {
  const tenantColumn = metadata.columns.find(
    (column) => column.propertyName === 'tenantId' || column.databaseName === 'tenant_id',
  );

  return tenantColumn?.databaseName ?? null;
}

async function countNullTenantRows(metadata: {
  name: string;
  tablePath: string;
  columns: Array<{ propertyName: string; databaseName: string }>;
}): Promise<NullTenantViolationEntry | null> {
  const tenantColumn = getTenantColumnName(metadata);
  if (!tenantColumn) {
    return null;
  }

  const rows = (await dataSource.query(
    `SELECT COUNT(*)::int AS count FROM ${quoteTablePath(metadata.tablePath)} WHERE ${quoteIdentifier(tenantColumn)} IS NULL`,
  )) as Array<{ count: unknown }>;
  const nullTenantCount = getCount(rows[0]?.count ?? 0);

  if (nullTenantCount === 0) {
    return null;
  }

  return {
    entityName: metadata.name,
    tableName: metadata.tablePath,
    tenantColumn,
    nullTenantCount,
  };
}

async function runCrossTenantCheck(config: ForeignKeyCheckConfig): Promise<CrossTenantViolationEntry | null> {
  const childMetadata = getMetadataByName(config.childEntity);
  const parentMetadata = getMetadataByName(config.parentEntity);

  const childTenantColumn = getTenantColumnName(childMetadata);
  const parentTenantColumn = getTenantColumnName(parentMetadata);

  if (!childTenantColumn || !parentTenantColumn) {
    return null;
  }

  const relation = childMetadata.relations.find((entry) => entry.propertyName === config.relationProperty);
  if (!relation) {
    throw new Error(
      `Relation "${config.childEntity}.${config.relationProperty}" not found for check "${config.checkName}".`,
    );
  }

  const childJoinColumn = relation.joinColumns[0];
  if (!childJoinColumn) {
    throw new Error(
      `Relation "${config.childEntity}.${config.relationProperty}" has no join columns for check "${config.checkName}".`,
    );
  }

  const parentPrimaryColumn = childJoinColumn.referencedColumn?.databaseName;
  if (!parentPrimaryColumn) {
    throw new Error(
      `Referenced primary column missing for check "${config.checkName}" on relation "${config.childEntity}.${config.relationProperty}".`,
    );
  }

  const rows = (await dataSource.query(
    `SELECT COUNT(*)::int AS count
     FROM ${quoteTablePath(childMetadata.tablePath)} child
     INNER JOIN ${quoteTablePath(parentMetadata.tablePath)} parent
       ON child.${quoteIdentifier(childJoinColumn.databaseName)} = parent.${quoteIdentifier(parentPrimaryColumn)}
     WHERE child.${quoteIdentifier(childTenantColumn)} IS NOT NULL
       AND parent.${quoteIdentifier(parentTenantColumn)} IS NOT NULL
       AND child.${quoteIdentifier(childTenantColumn)} <> parent.${quoteIdentifier(parentTenantColumn)}`,
  )) as Array<{ count: unknown }>;

  const mismatchCount = getCount(rows[0]?.count ?? 0);
  if (mismatchCount === 0) {
    return null;
  }

  return {
    checkName: config.checkName,
    childEntity: childMetadata.name,
    childTable: childMetadata.tablePath,
    childForeignKeyColumn: childJoinColumn.databaseName,
    parentEntity: parentMetadata.name,
    parentTable: parentMetadata.tablePath,
    parentPrimaryKeyColumn: parentPrimaryColumn,
    mismatchCount,
  };
}

async function main(): Promise<void> {
  const reportPath = path.join(process.cwd(), REPORT_FILE_NAME);

  try {
    await dataSource.initialize();

    const tenantScopedEntities = dataSource.entityMetadatas
      .map((metadata) => {
        const tenantColumn = getTenantColumnName(metadata);
        if (!tenantColumn) {
          return null;
        }
        return {
          entityName: metadata.name,
          tableName: metadata.tablePath,
          tenantColumn,
        } satisfies TenantScopedEntityEntry;
      })
      .filter((entry): entry is TenantScopedEntityEntry => entry !== null)
      .sort((left, right) => {
        if (left.tableName === right.tableName) {
          return left.entityName.localeCompare(right.entityName);
        }
        return left.tableName.localeCompare(right.tableName);
      });

    const nullTenantViolations = (
      await Promise.all(dataSource.entityMetadatas.map((metadata) => countNullTenantRows(metadata)))
    )
      .filter((entry): entry is NullTenantViolationEntry => entry !== null)
      .sort((left, right) => {
        if (left.tableName === right.tableName) {
          return left.entityName.localeCompare(right.entityName);
        }
        return left.tableName.localeCompare(right.tableName);
      });

    const crossTenantReferenceViolations = (await Promise.all(FK_CHECKS.map((check) => runCrossTenantCheck(check))))
      .filter((entry): entry is CrossTenantViolationEntry => entry !== null)
      .sort((left, right) => left.checkName.localeCompare(right.checkName));

    const totalViolations = nullTenantViolations.length + crossTenantReferenceViolations.length;

    if (totalViolations === 0) {
      if (fs.existsSync(reportPath)) {
        fs.unlinkSync(reportPath);
      }

      console.log('✅ Tenant integrity audit passed');
      console.log(`   Tenant-scoped entities inventoried: ${tenantScopedEntities.length}`);
      console.log(`   FK checks executed: ${FK_CHECKS.length}`);
      console.log(`   No violations found. Report file not written: ${REPORT_FILE_NAME}`);
      return;
    }

    const report = {
      tenantScopedEntities,
      nullTenantViolations,
      crossTenantReferenceViolations,
      totals: {
        tenantScopedEntityCount: tenantScopedEntities.length,
        nullTenantViolationTableCount: nullTenantViolations.length,
        crossTenantViolationCheckCount: crossTenantReferenceViolations.length,
        totalViolationCount: totalViolations,
      },
    };

    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

    console.error('❌ Tenant integrity audit found violations');
    console.error(`   Null-tenant violations: ${nullTenantViolations.length}`);
    console.error(`   Cross-tenant FK violations: ${crossTenantReferenceViolations.length}`);
    console.error(`   Report written to ${reportPath}`);
    process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message.trim() : '';
    const detail = message.length > 0 ? message : inspect(error, { depth: 3 });
    console.error('❌ Tenant integrity audit failed to run');
    console.error(`   ${detail}`);
    console.error('   Ensure database connectivity/env is configured before running this audit.');
    process.exitCode = 1;
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

void main();
