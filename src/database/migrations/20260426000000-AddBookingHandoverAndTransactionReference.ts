import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddBookingHandoverAndTransactionReference20260426000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'bookings',
      new TableColumn({
        name: 'handover_type',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'transactions',
      new TableColumn({
        name: 'reference',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('transactions', 'reference');
    await queryRunner.dropColumn('bookings', 'handover_type');
  }
}
