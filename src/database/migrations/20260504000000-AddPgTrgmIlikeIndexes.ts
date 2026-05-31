import type { MigrationInterface, QueryRunner } from 'typeorm';

async function ensureTrigramIndex(
  queryRunner: QueryRunner,
  table: string,
  column: string,
  indexName: string,
): Promise<void> {
  if (!(await queryRunner.hasTable(table))) {
    console.warn(`[Migration] Skipping index ${indexName}: table "${table}" does not exist`);
    return;
  }

  if (!(await queryRunner.hasColumn(table, column))) {
    console.warn(`[Migration] Skipping index ${indexName}: column "${table}"."${column}" does not exist`);
    return;
  }

  await queryRunner.query(
    `CREATE INDEX IF NOT EXISTS "${indexName}"
     ON "${table}" USING gin ("${column}" gin_trgm_ops)`,
  );
}

/**
 * BE#38 — pg_trgm GIN indexes for ILIKE search performance.
 *
 * Without trigram indexes, ILIKE '%…%' performs sequential scans on every
 * search request. GIN indexes on the pg_trgm operator class allow Postgres to
 * use index scans for leading-wildcard patterns, which makes these queries
 * O(log n) instead of O(n).
 *
 * Columns covered when present:
 *   - clients.name, clients.email, clients.phone, clients.phone2
 *   - bookings.notes
 *   - service_packages.name, service_packages.description
 *   - task_types.name
 *   - tasks.notes
 */
export class AddPgTrgmIlikeIndexes20260504000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable the extension (idempotent — safe to run multiple times)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // clients
    await ensureTrigramIndex(queryRunner, 'clients', 'name', 'IDX_clients_name_trgm');
    await ensureTrigramIndex(queryRunner, 'clients', 'email', 'IDX_clients_email_trgm');
    await ensureTrigramIndex(queryRunner, 'clients', 'phone', 'IDX_clients_phone_trgm');
    await ensureTrigramIndex(queryRunner, 'clients', 'phone2', 'IDX_clients_phone2_trgm');

    // bookings
    await ensureTrigramIndex(queryRunner, 'bookings', 'notes', 'IDX_bookings_notes_trgm');

    // catalog packages
    await ensureTrigramIndex(queryRunner, 'service_packages', 'name', 'IDX_service_packages_name_trgm');
    await ensureTrigramIndex(queryRunner, 'service_packages', 'description', 'IDX_service_packages_description_trgm');

    // task_types
    await ensureTrigramIndex(queryRunner, 'task_types', 'name', 'IDX_task_types_name_trgm');

    // tasks
    await ensureTrigramIndex(queryRunner, 'tasks', 'notes', 'IDX_tasks_notes_trgm');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tasks_notes_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_task_types_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_service_packages_description_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_service_packages_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bookings_notes_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clients_phone2_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clients_phone_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clients_email_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clients_name_trgm"`);
  }
}
