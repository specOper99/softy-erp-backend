import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTemplateFieldsToServicePackages1768000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('service_packages', [
      new TableColumn({
        name: 'is_template',
        type: 'boolean',
        default: false,
      }),
      new TableColumn({
        name: 'template_category',
        type: 'varchar',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('service_packages', 'template_category');
    await queryRunner.dropColumn('service_packages', 'is_template');
  }
}
