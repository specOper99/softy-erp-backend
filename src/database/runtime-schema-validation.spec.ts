import 'reflect-metadata';
import { findMissingSchemaColumns, type SchemaExpectation } from './runtime-schema-validation';
import { findMissingEnumLabels } from './enum-sync';

describe('runtime-schema-validation', () => {
  it('reports missing columns with table-qualified names', () => {
    const expectedSchema: SchemaExpectation[] = [
      {
        schema: 'public',
        table: 'bookings',
        columns: ['id', 'handover_type'],
      },
    ];

    const actualSchema = new Map<string, Set<string>>([['public.bookings', new Set(['id'])]]);

    expect(findMissingSchemaColumns(expectedSchema, actualSchema)).toEqual(['bookings.handover_type']);
  });

  it('reports missing tables once instead of every missing column', () => {
    const expectedSchema: SchemaExpectation[] = [
      {
        schema: 'public',
        table: 'booking_processing_types',
        columns: ['booking_id', 'processing_type_id'],
      },
    ];

    expect(findMissingSchemaColumns(expectedSchema, new Map())).toEqual(['booking_processing_types (table missing)']);
  });

  it('reports enum drift through shared enum-sync helpers', () => {
    const pgLabels = new Map<string, Set<string>>([['privacy_requests_type_enum', new Set(['DATA_EXPORT'])]]);
    expect(
      findMissingEnumLabels(
        [
          {
            table: 'privacy_requests',
            column: 'type',
            pgEnumName: 'privacy_requests_type_enum',
            tsValues: ['DATA_EXPORT', 'DATA_DELETION'],
          },
        ],
        pgLabels,
      ),
    ).toEqual([
      'privacy_requests.type: TS value "DATA_DELETION" missing from PostgreSQL enum "privacy_requests_type_enum"',
    ]);
  });
});
