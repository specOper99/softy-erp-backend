import {
  findMissingMigrationEnumLabels,
  parseMigrationEnumCorpus,
  type MigrationEnumCorpus,
} from './enum-migration-coverage';
import type { EnumExpectation } from './enum-sync';

describe('enum-migration-coverage', () => {
  it('parses CREATE TYPE and ADD VALUE labels', () => {
    const corpus = parseMigrationEnumCorpus([
      `
        CREATE TYPE "public"."notifications_notification_type_enum" AS ENUM(
          'BOOKING_CREATED',
          'BOOKING_UPDATED'
        );
        ALTER TYPE "public"."notifications_notification_type_enum"
          ADD VALUE IF NOT EXISTS 'BOOKING_COMPLETED';
      `,
    ]);

    expect(corpus.get('notifications_notification_type_enum')).toEqual(
      new Set(['BOOKING_CREATED', 'BOOKING_UPDATED', 'BOOKING_COMPLETED']),
    );
  });

  it('parses TypeORM enumName + enum arrays', () => {
    const corpus = parseMigrationEnumCorpus([
      `
        new TableColumn({
          name: 'notification_type',
          type: 'enum',
          enumName: 'notification_preferences_notification_type_enum',
          enum: [
            'BOOKING_CREATED',
            'BOOKING_COMPLETED',
          ],
        })
      `,
    ]);

    expect(corpus.get('notification_preferences_notification_type_enum')).toEqual(
      new Set(['BOOKING_CREATED', 'BOOKING_COMPLETED']),
    );
  });

  it('parses createTable enum columns without enumName', () => {
    const corpus = parseMigrationEnumCorpus([
      `
        await queryRunner.createTable(
          new Table({
            name: 'notifications',
            columns: [
              {
                name: 'notification_type',
                type: 'enum',
                enum: [
                  'BOOKING_CREATED',
                  'BOOKING_COMPLETED',
                ],
              },
            ],
          }),
        );
      `,
    ]);

    expect(corpus.get('notifications_notification_type_enum')).toEqual(
      new Set(['BOOKING_CREATED', 'BOOKING_COMPLETED']),
    );
  });

  it('reports TS labels missing from migration corpus', () => {
    const expectations: EnumExpectation[] = [
      {
        table: 'notifications',
        column: 'notification_type',
        pgEnumName: 'notifications_notification_type_enum',
        tsValues: ['BOOKING_CREATED', 'BOOKING_COMPLETED'],
      },
    ];
    const corpus: MigrationEnumCorpus = new Map([
      ['notifications_notification_type_enum', new Set(['BOOKING_CREATED'])],
    ]);

    expect(findMissingMigrationEnumLabels(expectations, corpus)).toEqual([
      'notifications.notification_type: TS value "BOOKING_COMPLETED" missing from migration corpus for "notifications_notification_type_enum"',
    ]);
  });

  it('reports missing enum types entirely', () => {
    const expectations: EnumExpectation[] = [
      {
        table: 'bookings',
        column: 'status',
        pgEnumName: 'bookings_status_enum',
        tsValues: ['DRAFT'],
      },
    ];

    expect(findMissingMigrationEnumLabels(expectations, new Map())).toEqual([
      'bookings.status: no CREATE TYPE / ADD VALUE / TypeORM enum coverage for "bookings_status_enum"',
    ]);
  });
});
