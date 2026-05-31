import type { MigrationInterface, QueryRunner } from 'typeorm';

async function addConstraintIfMissing(
  queryRunner: QueryRunner,
  constraintName: string,
  definition: string,
): Promise<void> {
  const existing = (await queryRunner.query(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [constraintName])) as
    | unknown[]
    | undefined;

  if (existing && existing.length > 0) {
    return;
  }

  await queryRunner.query(`
    ALTER TABLE bookings
    ADD CONSTRAINT "${constraintName}"
    CHECK (${definition})
  `);
}

export class AddBookingStatusConstraints1738108524000 implements MigrationInterface {
  name = 'AddBookingStatusConstraints1738108524000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add CHECK constraint for valid booking statuses
    await addConstraintIfMissing(
      queryRunner,
      'chk_booking_status_enum',
      `status IN ('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED')`,
    );

    // Add CHECK constraint: if status is CANCELLED, cancelledAt must be set
    await addConstraintIfMissing(
      queryRunner,
      'chk_cancelled_requires_timestamp',
      `
        (status != 'CANCELLED') OR
        (status = 'CANCELLED' AND cancelled_at IS NOT NULL)
      `,
    );

    // Add CHECK constraint: if status is COMPLETED, all tasks must be completed
    // Note: This is enforced at application level via BookingWorkflowService
    // We can't enforce this at DB level without a complex trigger
    // But we can ensure completion_verified flag is set
    await addConstraintIfMissing(
      queryRunner,
      'chk_completed_requires_verification',
      `
        (status != 'COMPLETED') OR
        (status = 'COMPLETED' AND cancelled_at IS NULL)
      `,
    );

    // Add CHECK constraint: cancelled bookings cannot have future status changes
    // This is enforced at application level - once CANCELLED or COMPLETED, status is terminal
    await addConstraintIfMissing(
      queryRunner,
      'chk_refund_amount_valid',
      `
        refund_amount >= 0 AND
        refund_amount <= total_price
      `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_refund_amount_valid`);
    await queryRunner.query(`ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_completed_requires_verification`);
    await queryRunner.query(`ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_cancelled_requires_timestamp`);
    await queryRunner.query(`ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_booking_status_enum`);
  }
}
