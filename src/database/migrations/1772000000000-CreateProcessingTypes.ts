import type { MigrationInterface, QueryRunner } from 'typeorm';
import { Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateProcessingTypes1772000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create processing_types table
    await queryRunner.createTable(
      new Table({
        name: 'processing_types',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
          { name: 'tenant_id', type: 'uuid', isNullable: false },
          { name: 'name', type: 'varchar', length: '100', isNullable: false },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'sort_order', type: 'int', default: 0, isNullable: false },
          { name: 'is_active', type: 'boolean', default: true, isNullable: false },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    // Unique constraint: one name per tenant
    await queryRunner.createIndex(
      'processing_types',
      new TableIndex({
        name: 'IDX_processing_types_tenant_name',
        columnNames: ['tenant_id', 'name'],
        isUnique: true,
      }),
    );

    // FK: processing_types.tenant_id -> tenants.id
    await queryRunner.createForeignKey(
      'processing_types',
      new TableForeignKey({
        name: 'FK_processing_types_tenant',
        columnNames: ['tenant_id'],
        referencedTableName: 'tenants',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Create booking_processing_types join table
    await queryRunner.createTable(
      new Table({
        name: 'booking_processing_types',
        columns: [
          { name: 'booking_id', type: 'uuid', isNullable: false },
          { name: 'processing_type_id', type: 'uuid', isNullable: false },
        ],
        indices: [
          { name: 'IDX_bpt_booking', columnNames: ['booking_id'] },
          { name: 'IDX_bpt_processing_type', columnNames: ['processing_type_id'] },
        ],
      }),
      true,
    );

    // Composite PK on join table
    await queryRunner.query(
      `ALTER TABLE booking_processing_types ADD CONSTRAINT "PK_booking_processing_types" PRIMARY KEY (booking_id, processing_type_id)`,
    );

    // FK: booking_processing_types.booking_id -> bookings.id
    await queryRunner.createForeignKey(
      'booking_processing_types',
      new TableForeignKey({
        name: 'FK_bpt_booking',
        columnNames: ['booking_id'],
        referencedTableName: 'bookings',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // FK: booking_processing_types.processing_type_id -> processing_types.id
    await queryRunner.createForeignKey(
      'booking_processing_types',
      new TableForeignKey({
        name: 'FK_bpt_processing_type',
        columnNames: ['processing_type_id'],
        referencedTableName: 'processing_types',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('booking_processing_types', true);
    await queryRunner.dropTable('processing_types', true);
  }
}
