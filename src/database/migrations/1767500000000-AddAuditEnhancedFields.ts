import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAuditEnhancedFields1767500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('audit_logs', [
      new TableColumn({
        name: 'ip_address',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'user_agent',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'method',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'path',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'status_code',
        type: 'integer',
        isNullable: true,
      }),
      new TableColumn({
        name: 'duration_ms',
        type: 'integer',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('audit_logs', [
      'ip_address',
      'user_agent',
      'method',
      'path',
      'status_code',
      'duration_ms',
    ]);
  }
}
