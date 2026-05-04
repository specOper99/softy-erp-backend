import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE#38 — pg_trgm GIN indexes for ILIKE search performance.
 *
 * Without trigram indexes, ILIKE '%…%' performs sequential scans on every
 * search request. GIN indexes on the pg_trgm operator class allow Postgres to
 * use index scans for leading-wildcard patterns, which makes these queries
 * O(log n) instead of O(n).
 *
 * Columns covered:
 *   - clients.name, clients.email, clients.phone, clients.phone2
 *   - bookings.notes
 *   - catalog_packages.name, catalog_packages.description
 *   - task_types.name
 *   - tasks.notes
 */
export class AddPgTrgmIlikeIndexes20260504000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable the extension (idempotent — safe to run multiple times)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // clients
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_clients_name_trgm"
       ON "clients" USING gin ("name" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_clients_email_trgm"
       ON "clients" USING gin ("email" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_clients_phone_trgm"
       ON "clients" USING gin ("phone" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_clients_phone2_trgm"
       ON "clients" USING gin ("phone2" gin_trgm_ops)`,
    );

    // bookings
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bookings_notes_trgm"
       ON "bookings" USING gin ("notes" gin_trgm_ops)`,
    );

    // catalog packages
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_catalog_packages_name_trgm"
       ON "catalog_packages" USING gin ("name" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_catalog_packages_description_trgm"
       ON "catalog_packages" USING gin ("description" gin_trgm_ops)`,
    );

    // task_types
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_task_types_name_trgm"
       ON "task_types" USING gin ("name" gin_trgm_ops)`,
    );

    // tasks
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tasks_notes_trgm"
       ON "tasks" USING gin ("notes" gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tasks_notes_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_task_types_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_catalog_packages_description_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_catalog_packages_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bookings_notes_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clients_phone2_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clients_phone_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clients_email_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clients_name_trgm"`);
  }
}
