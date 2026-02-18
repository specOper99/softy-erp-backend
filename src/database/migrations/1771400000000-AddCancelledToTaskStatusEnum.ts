import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCancelledToTaskStatusEnum1771400000000 implements MigrationInterface {
  name = 'AddCancelledToTaskStatusEnum1771400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('tasks')) {
      await queryRunner.query(`
        DO $$
        BEGIN
          ALTER TYPE "public"."tasks_status_enum" ADD VALUE IF NOT EXISTS 'CANCELLED';
        END $$;
      `);
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: enum values cannot be removed safely in PostgreSQL
    // Removing an enum value could break existing data
  }
}
