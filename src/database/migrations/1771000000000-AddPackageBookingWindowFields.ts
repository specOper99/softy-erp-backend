import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPackageBookingWindowFields1771000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const packageColumns = [
      new TableColumn({
        name: 'duration_minutes',
        type: 'int',
        default: 60,
      }),
      new TableColumn({
        name: 'required_staff_count',
        type: 'int',
        default: 1,
      }),
      new TableColumn({
        name: 'revenue_account_code',
        type: 'varchar',
        length: '64',
        default: `'SERVICES'`,
      }),
    ];

    for (const column of packageColumns) {
      if (!(await queryRunner.hasColumn('service_packages', column.name))) {
        await queryRunner.addColumn('service_packages', column);
      }
    }

    const hasBookingDuration = await queryRunner.hasColumn('bookings', 'duration_minutes');
    if (!hasBookingDuration) {
      await queryRunner.addColumn(
        'bookings',
        new TableColumn({
          name: 'duration_minutes',
          type: 'int',
          default: 0,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('bookings', 'duration_minutes')) {
      await queryRunner.dropColumn('bookings', 'duration_minutes');
    }

    const packageColumnNames = ['revenue_account_code', 'required_staff_count', 'duration_minutes'];
    for (const columnName of packageColumnNames) {
      if (await queryRunner.hasColumn('service_packages', columnName)) {
        await queryRunner.dropColumn('service_packages', columnName);
      }
    }
  }
}
