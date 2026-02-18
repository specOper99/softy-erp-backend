import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateTaskTypeEligibility1771100000000 implements MigrationInterface {
  name = 'CreateTaskTypeEligibility1771100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('task_type_eligibilities'))) {
      await queryRunner.createTable(
        new Table({
          name: 'task_type_eligibilities',
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
              name: 'user_id',
              type: 'uuid',
              isNullable: false,
            },
            {
              name: 'task_type_id',
              type: 'uuid',
              isNullable: false,
            },
          ],
        }),
      );
    }

    const table = await queryRunner.getTable('task_type_eligibilities');

    const hasTenantUserTaskTypeUnique = table?.indices.some(
      (index) => index.name === 'IDX_task_type_eligibility_tenant_user_task_type_unique',
    );
    if (!hasTenantUserTaskTypeUnique) {
      await queryRunner.createIndex(
        'task_type_eligibilities',
        new TableIndex({
          name: 'IDX_task_type_eligibility_tenant_user_task_type_unique',
          columnNames: ['tenant_id', 'user_id', 'task_type_id'],
          isUnique: true,
        }),
      );
    }

    const hasTenantUserIndex = table?.indices.some((index) => index.name === 'IDX_task_type_eligibility_tenant_user');
    if (!hasTenantUserIndex) {
      await queryRunner.createIndex(
        'task_type_eligibilities',
        new TableIndex({
          name: 'IDX_task_type_eligibility_tenant_user',
          columnNames: ['tenant_id', 'user_id'],
        }),
      );
    }

    const hasTenantTaskTypeIndex = table?.indices.some(
      (index) => index.name === 'IDX_task_type_eligibility_tenant_task_type',
    );
    if (!hasTenantTaskTypeIndex) {
      await queryRunner.createIndex(
        'task_type_eligibilities',
        new TableIndex({
          name: 'IDX_task_type_eligibility_tenant_task_type',
          columnNames: ['tenant_id', 'task_type_id'],
        }),
      );
    }

    const hasUserForeignKey = table?.foreignKeys.some(
      (foreignKey) => foreignKey.name === 'FK_task_type_eligibility_user',
    );
    if (!hasUserForeignKey) {
      await queryRunner.createForeignKey(
        'task_type_eligibilities',
        new TableForeignKey({
          name: 'FK_task_type_eligibility_user',
          columnNames: ['user_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }

    const hasTaskTypeForeignKey = table?.foreignKeys.some(
      (foreignKey) => foreignKey.name === 'FK_task_type_eligibility_task_type',
    );
    if (!hasTaskTypeForeignKey) {
      await queryRunner.createForeignKey(
        'task_type_eligibilities',
        new TableForeignKey({
          name: 'FK_task_type_eligibility_task_type',
          columnNames: ['task_type_id'],
          referencedTableName: 'task_types',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('task_type_eligibilities'))) {
      return;
    }

    const table = await queryRunner.getTable('task_type_eligibilities');
    const userForeignKey = table?.foreignKeys.find((foreignKey) => foreignKey.name === 'FK_task_type_eligibility_user');
    if (userForeignKey) {
      await queryRunner.dropForeignKey('task_type_eligibilities', userForeignKey);
    }

    const taskTypeForeignKey = table?.foreignKeys.find(
      (foreignKey) => foreignKey.name === 'FK_task_type_eligibility_task_type',
    );
    if (taskTypeForeignKey) {
      await queryRunner.dropForeignKey('task_type_eligibilities', taskTypeForeignKey);
    }

    if (table?.indices.some((index) => index.name === 'IDX_task_type_eligibility_tenant_task_type')) {
      await queryRunner.dropIndex('task_type_eligibilities', 'IDX_task_type_eligibility_tenant_task_type');
    }

    if (table?.indices.some((index) => index.name === 'IDX_task_type_eligibility_tenant_user')) {
      await queryRunner.dropIndex('task_type_eligibilities', 'IDX_task_type_eligibility_tenant_user');
    }

    if (table?.indices.some((index) => index.name === 'IDX_task_type_eligibility_tenant_user_task_type_unique')) {
      await queryRunner.dropIndex('task_type_eligibilities', 'IDX_task_type_eligibility_tenant_user_task_type_unique');
    }

    await queryRunner.dropTable('task_type_eligibilities');
  }
}
