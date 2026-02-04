import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateReviewsTable1770600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'reviews',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'tenant_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'client_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'booking_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'package_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'rating',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'comment',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING', 'APPROVED', 'REJECTED'],
            default: "'PENDING'",
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Add check constraint for rating
    await queryRunner.query(`
      ALTER TABLE reviews
      ADD CONSTRAINT chk_reviews_rating CHECK (rating >= 1 AND rating <= 5)
    `);

    // Add unique constraint for one review per booking per client
    await queryRunner.query(`
      ALTER TABLE reviews
      ADD CONSTRAINT uq_reviews_client_booking UNIQUE (client_id, booking_id)
    `);

    // Create foreign keys
    await queryRunner.createForeignKey(
      'reviews',
      new TableForeignKey({
        name: 'fk_reviews_tenant',
        columnNames: ['tenant_id'],
        referencedTableName: 'tenants',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'reviews',
      new TableForeignKey({
        name: 'fk_reviews_client',
        columnNames: ['client_id'],
        referencedTableName: 'clients',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'reviews',
      new TableForeignKey({
        name: 'fk_reviews_booking',
        columnNames: ['booking_id'],
        referencedTableName: 'bookings',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'reviews',
      new TableForeignKey({
        name: 'fk_reviews_package',
        columnNames: ['package_id'],
        referencedTableName: 'service_packages',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Create indexes
    await queryRunner.createIndex(
      'reviews',
      new TableIndex({
        name: 'idx_reviews_tenant_package_status',
        columnNames: ['tenant_id', 'package_id', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'reviews',
      new TableIndex({
        name: 'idx_reviews_tenant_client',
        columnNames: ['tenant_id', 'client_id'],
      }),
    );

    await queryRunner.createIndex(
      'reviews',
      new TableIndex({
        name: 'idx_reviews_tenant_booking',
        columnNames: ['tenant_id', 'booking_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('reviews', true);
  }
}
