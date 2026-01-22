import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMissingBookingColumns1768000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create PaymentStatus enum if it doesn't exist
    const hasEnum = (await queryRunner.query(
      `SELECT 1 FROM pg_type WHERE typname = 'payment_status_enum'`,
    )) as unknown[];
    if (hasEnum.length === 0) {
      await queryRunner.query(`
                CREATE TYPE "public"."payment_status_enum" AS ENUM('UNPAID', 'DEPOSIT_PAID', 'PARTIALLY_PAID', 'FULLY_PAID')
            `);
    }

    const columns = [
      new TableColumn({
        name: 'sub_total',
        type: 'decimal',
        precision: 12,
        scale: 2,
        default: 0,
      }),
      new TableColumn({
        name: 'tax_rate',
        type: 'decimal',
        precision: 5,
        scale: 2,
        default: 0,
      }),
      new TableColumn({
        name: 'tax_amount',
        type: 'decimal',
        precision: 12,
        scale: 2,
        default: 0,
      }),
      new TableColumn({
        name: 'deposit_percentage',
        type: 'decimal',
        precision: 5,
        scale: 2,
        default: 0,
      }),
      new TableColumn({
        name: 'deposit_amount',
        type: 'decimal',
        precision: 12,
        scale: 2,
        default: 0,
      }),
      new TableColumn({
        name: 'amount_paid',
        type: 'decimal',
        precision: 12,
        scale: 2,
        default: 0,
      }),
      new TableColumn({
        name: 'payment_status',
        type: 'enum',
        enumName: 'payment_status_enum',
        default: `'UNPAID'`,
      }),
      new TableColumn({
        name: 'refund_amount',
        type: 'decimal',
        precision: 12,
        scale: 2,
        default: 0,
      }),
      new TableColumn({
        name: 'cancellation_reason',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'cancelled_at',
        type: 'timestamptz',
        isNullable: true,
      }),
      new TableColumn({
        name: 'deleted_at',
        type: 'timestamptz',
        isNullable: true,
      }),
    ];

    for (const column of columns) {
      const hasColumn = await queryRunner.hasColumn('bookings', column.name);
      if (!hasColumn) {
        await queryRunner.addColumn('bookings', column);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const columns = [
      'sub_total',
      'tax_rate',
      'tax_amount',
      'deposit_percentage',
      'deposit_amount',
      'amount_paid',
      'payment_status',
      'refund_amount',
      'cancellation_reason',
      'cancelled_at',
      'deleted_at',
    ];

    for (const colName of columns) {
      if (await queryRunner.hasColumn('bookings', colName)) {
        await queryRunner.dropColumn('bookings', colName);
      }
    }

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."payment_status_enum"`);
  }
}
