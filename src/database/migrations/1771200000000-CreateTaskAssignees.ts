import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateTaskAssignees1771200000000 implements MigrationInterface {
  name = 'CreateTaskAssignees1771200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('task_assignees'))) {
      await queryRunner.createTable(
        new Table({
          name: 'task_assignees',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: 'uuid_generate_v4()',
            },
            {
              name: 'tenant_id',
              type: 'uuid',
              isNullable: false,
            },
            {
              name: 'created_at',
              type: 'timestamptz',
              default: 'now()',
              isNullable: false,
            },
            {
              name: 'updated_at',
              type: 'timestamptz',
              default: 'now()',
              isNullable: false,
            },
            {
              name: 'task_id',
              type: 'uuid',
              isNullable: false,
            },
            {
              name: 'user_id',
              type: 'uuid',
              isNullable: false,
            },
            {
              name: 'role',
              type: 'enum',
              enumName: 'task_assignees_role_enum',
              enum: ['LEAD', 'ASSISTANT'],
              default: "'ASSISTANT'",
              isNullable: false,
            },
            {
              name: 'commission_snapshot',
              type: 'decimal',
              precision: 12,
              scale: 2,
              default: 0,
              isNullable: false,
            },
          ],
        }),
      );
    }

    const table = await queryRunner.getTable('task_assignees');

    const hasTenantTaskUserUnique = table?.indices.some(
      (index) => index.name === 'IDX_task_assignees_tenant_task_user_unique',
    );
    if (!hasTenantTaskUserUnique) {
      await queryRunner.createIndex(
        'task_assignees',
        new TableIndex({
          name: 'IDX_task_assignees_tenant_task_user_unique',
          columnNames: ['tenant_id', 'task_id', 'user_id'],
          isUnique: true,
        }),
      );
    }

    const hasTenantTaskIndex = table?.indices.some((index) => index.name === 'IDX_task_assignees_tenant_task');
    if (!hasTenantTaskIndex) {
      await queryRunner.createIndex(
        'task_assignees',
        new TableIndex({
          name: 'IDX_task_assignees_tenant_task',
          columnNames: ['tenant_id', 'task_id'],
        }),
      );
    }

    const hasTenantUserIndex = table?.indices.some((index) => index.name === 'IDX_task_assignees_tenant_user');
    if (!hasTenantUserIndex) {
      await queryRunner.createIndex(
        'task_assignees',
        new TableIndex({
          name: 'IDX_task_assignees_tenant_user',
          columnNames: ['tenant_id', 'user_id'],
        }),
      );
    }

    const hasTaskForeignKey = table?.foreignKeys.some((foreignKey) => foreignKey.name === 'FK_task_assignees_task');
    if (!hasTaskForeignKey) {
      await queryRunner.createForeignKey(
        'task_assignees',
        new TableForeignKey({
          name: 'FK_task_assignees_task',
          columnNames: ['task_id', 'tenant_id'],
          referencedTableName: 'tasks',
          referencedColumnNames: ['id', 'tenant_id'],
          onDelete: 'CASCADE',
        }),
      );
    }

    const hasUserForeignKey = table?.foreignKeys.some((foreignKey) => foreignKey.name === 'FK_task_assignees_user');
    if (!hasUserForeignKey) {
      await queryRunner.createForeignKey(
        'task_assignees',
        new TableForeignKey({
          name: 'FK_task_assignees_user',
          columnNames: ['user_id', 'tenant_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id', 'tenant_id'],
          onDelete: 'CASCADE',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('task_assignees'))) {
      return;
    }

    const table = await queryRunner.getTable('task_assignees');

    const userForeignKey = table?.foreignKeys.find((foreignKey) => foreignKey.name === 'FK_task_assignees_user');
    if (userForeignKey) {
      await queryRunner.dropForeignKey('task_assignees', userForeignKey);
    }

    const taskForeignKey = table?.foreignKeys.find((foreignKey) => foreignKey.name === 'FK_task_assignees_task');
    if (taskForeignKey) {
      await queryRunner.dropForeignKey('task_assignees', taskForeignKey);
    }

    if (table?.indices.some((index) => index.name === 'IDX_task_assignees_tenant_user')) {
      await queryRunner.dropIndex('task_assignees', 'IDX_task_assignees_tenant_user');
    }

    if (table?.indices.some((index) => index.name === 'IDX_task_assignees_tenant_task')) {
      await queryRunner.dropIndex('task_assignees', 'IDX_task_assignees_tenant_task');
    }

    if (table?.indices.some((index) => index.name === 'IDX_task_assignees_tenant_task_user_unique')) {
      await queryRunner.dropIndex('task_assignees', 'IDX_task_assignees_tenant_task_user_unique');
    }

    await queryRunner.dropTable('task_assignees');
    await queryRunner.query('DROP TYPE IF EXISTS "task_assignees_role_enum"');
  }
}
