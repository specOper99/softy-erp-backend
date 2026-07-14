import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supports tasks cursor pagination: ORDER BY created_at DESC, id DESC
 * filtered by tenant_id (see TasksService.findAllCursor).
 */
export class AddTasksCursorPaginationIndex1773000000000 implements MigrationInterface {
  name = 'AddTasksCursorPaginationIndex1773000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_tenant_created_id_cursor
      ON tasks (tenant_id, created_at DESC, id DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tasks_tenant_created_id_cursor`);
  }
}
