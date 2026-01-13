import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddMissingTaskColumns1768000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasParentId = await queryRunner.hasColumn('tasks', 'parent_id');
    if (!hasParentId) {
      await queryRunner.addColumn(
        'tasks',
        new TableColumn({
          name: 'parent_id',
          type: 'uuid',
          isNullable: true,
        }),
      );

      await queryRunner.createForeignKey(
        'tasks',
        new TableForeignKey({
          columnNames: ['parent_id'],
          referencedColumnNames: ['id'],
          referencedTableName: 'tasks',
          onDelete: 'SET NULL',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('tasks');
    const foreignKey = table?.foreignKeys.find((fk) => fk.columnNames.indexOf('parent_id') !== -1);
    if (foreignKey) {
      await queryRunner.dropForeignKey('tasks', foreignKey);
    }

    if (await queryRunner.hasColumn('tasks', 'parent_id')) {
      await queryRunner.dropColumn('tasks', 'parent_id');
    }
  }
}
