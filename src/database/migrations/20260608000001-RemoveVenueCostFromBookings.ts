import type { MigrationInterface, QueryRunner } from 'typeorm';
import { TableColumn } from 'typeorm';

export class RemoveVenueCostFromBookings20260608000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('bookings', 'venue_cost');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
}
