import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class AddClientPortalFields1770500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add startTime to bookings table
    if (!(await queryRunner.hasColumn('bookings', 'start_time'))) {
      await queryRunner.addColumn(
        'bookings',
        new TableColumn({
          name: 'start_time',
          type: 'varchar',
          length: '5',
          isNullable: true,
          comment: 'UTC time in HH:mm format',
        }),
      );
    }

    // 2. Add notificationPreferences to clients table
    if (!(await queryRunner.hasColumn('clients', 'notification_preferences'))) {
      await queryRunner.addColumn(
        'clients',
        new TableColumn({
          name: 'notification_preferences',
          type: 'jsonb',
          default: '\'{"email": true, "inApp": true}\'',
          isNullable: false,
        }),
      );
    }

    // 3. Add clientId to notifications table for client portal notifications
    if ((await queryRunner.hasTable('notifications')) && !(await queryRunner.hasColumn('notifications', 'client_id'))) {
      await queryRunner.addColumn(
        'notifications',
        new TableColumn({
          name: 'client_id',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }

    // Add foreign key for client_id in notifications
    if (await queryRunner.hasTable('notifications')) {
      const notificationsTable = await queryRunner.getTable('notifications');
      const hasClientFk = notificationsTable?.foreignKeys.some((key) => key.name === 'fk_notifications_client');

      if (!hasClientFk) {
        await queryRunner.createForeignKey(
          'notifications',
          new TableForeignKey({
            name: 'fk_notifications_client',
            columnNames: ['client_id'],
            referencedTableName: 'clients',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        );
      }
    }

    // Add index for client notifications
    if (await queryRunner.hasTable('notifications')) {
      const notificationsTable = await queryRunner.getTable('notifications');
      const hasClientReadIndex = notificationsTable?.indices.some(
        (index) => index.name === 'idx_notifications_client_read',
      );

      if (!hasClientReadIndex) {
        await queryRunner.createIndex(
          'notifications',
          new TableIndex({
            name: 'idx_notifications_client_read',
            columnNames: ['client_id', 'read'],
          }),
        );
      }
    }

    // 4. Add tenant scheduling fields
    const tenantColumns: TableColumn[] = [
      new TableColumn({
        name: 'working_hours',
        type: 'jsonb',
        isNullable: true,
        comment: 'Working hours per day in UTC: {monday: {start: "09:00", end: "18:00", enabled: true}, ...}',
      }),
      new TableColumn({
        name: 'default_booking_duration_hours',
        type: 'decimal',
        precision: 4,
        scale: 2,
        isNullable: true,
        default: 2.0,
        comment: 'Default duration for all bookings in hours',
      }),
      new TableColumn({
        name: 'max_concurrent_bookings_per_slot',
        type: 'int',
        isNullable: false,
        default: 1,
        comment: 'Maximum number of concurrent bookings allowed per time slot',
      }),
      new TableColumn({
        name: 'time_slot_duration_minutes',
        type: 'int',
        isNullable: false,
        default: 60,
        comment: 'Duration of each time slot in minutes (e.g., 30 or 60)',
      }),
      new TableColumn({
        name: 'minimum_notice_period_hours',
        type: 'int',
        isNullable: false,
        default: 24,
        comment: 'Minimum notice period required before event date',
      }),
      new TableColumn({
        name: 'max_advance_booking_days',
        type: 'int',
        isNullable: false,
        default: 90,
        comment: 'Maximum days in advance clients can book',
      }),
      new TableColumn({
        name: 'notification_emails',
        type: 'jsonb',
        isNullable: false,
        default: "'[]'",
        comment: 'Email addresses to notify for booking requests',
      }),
    ];

    for (const column of tenantColumns) {
      if (!(await queryRunner.hasColumn('tenants', column.name))) {
        await queryRunner.addColumn('tenants', column);
      }
    }

    // Add index for booking availability queries
    const bookingsTable = await queryRunner.getTable('bookings');
    const hasAvailabilityIndex = bookingsTable?.indices.some((index) => index.name === 'idx_bookings_availability');

    if (!hasAvailabilityIndex) {
      await queryRunner.createIndex(
        'bookings',
        new TableIndex({
          name: 'idx_bookings_availability',
          columnNames: ['tenant_id', 'package_id', 'event_date', 'start_time', 'status'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tenant columns
    await queryRunner.dropColumn('tenants', 'notification_emails');
    await queryRunner.dropColumn('tenants', 'max_advance_booking_days');
    await queryRunner.dropColumn('tenants', 'minimum_notice_period_hours');
    await queryRunner.dropColumn('tenants', 'time_slot_duration_minutes');
    await queryRunner.dropColumn('tenants', 'max_concurrent_bookings_per_slot');
    await queryRunner.dropColumn('tenants', 'default_booking_duration_hours');
    await queryRunner.dropColumn('tenants', 'working_hours');

    // Drop booking index
    await queryRunner.dropIndex('bookings', 'idx_bookings_availability');

    // Drop notifications client_id
    await queryRunner.dropIndex('notifications', 'idx_notifications_client_read');
    await queryRunner.dropForeignKey('notifications', 'fk_notifications_client');
    await queryRunner.dropColumn('notifications', 'client_id');

    // Drop clients column
    await queryRunner.dropColumn('clients', 'notification_preferences');

    // Drop bookings column
    await queryRunner.dropColumn('bookings', 'start_time');
  }
}
