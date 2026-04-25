import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddVenueCostToBookings1772200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'bookings',
      new TableColumn({
        name: 'venue_cost',
        type: 'decimal',
        precision: 12,
        scale: 2,
        isNullable: false,
        default: '0',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('bookings', 'venue_cost');
  }
}
