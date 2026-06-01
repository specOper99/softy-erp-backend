import 'reflect-metadata';
import { findMissingSchemaColumns, type SchemaExpectation } from './runtime-schema-validation';

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
});
