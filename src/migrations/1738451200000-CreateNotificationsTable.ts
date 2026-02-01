import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateNotificationsTable1738451200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'notifications',
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
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'notification_type',
            type: 'enum',
            enum: [
              'BOOKING_CREATED',
              'BOOKING_UPDATED',
              'BOOKING_CANCELLED',
              'TASK_ASSIGNED',
              'TASK_COMPLETED',
              'PAYMENT_RECEIVED',
              'SYSTEM_ALERT',
            ],
            isNullable: false,
          },
          {
            name: 'title',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'message',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'read',
            type: 'boolean',
            default: false,
          },
          {
            name: 'read_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'action_url',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    // Create index on tenant_id for multi-tenancy
    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'IDX_notifications_tenant_id',
        columnNames: ['tenant_id'],
      }),
    );

    // Create composite index for userId and read status
    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'IDX_notifications_user_id_read',
        columnNames: ['user_id', 'read'],
      }),
    );

    // Create composite index for userId and createdAt for efficient sorting
    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'IDX_notifications_user_id_created_at',
        columnNames: ['user_id', 'created_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notifications', true);
  }
}
