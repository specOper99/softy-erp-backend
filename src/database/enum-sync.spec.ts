import 'reflect-metadata';
import {
  collectEnumExpectations,
  extractEnumStringValues,
  findMissingEnumLabels,
  resolvePgEnumName,
  type EnumExpectation,
} from './enum-sync';

enum SampleStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
}

describe('enum-sync', () => {
  it('extracts string enum members only', () => {
    enum MixedEnum {
      A = 'A',
      B = 'B',
    }

    expect(extractEnumStringValues(MixedEnum)).toEqual(['A', 'B']);
    expect(extractEnumStringValues(SampleStatus)).toEqual(['DRAFT', 'CONFIRMED']);
  });

  it('resolves pg enum names with overrides and convention fallback', () => {
    expect(resolvePgEnumName('bookings', 'payment_status')).toBe('payment_status_enum');
    expect(resolvePgEnumName('tenants', 'base_currency')).toBe('currency_enum');
    expect(resolvePgEnumName('tenants', 'subscriptionPlan')).toBe('tenants_subscriptionplan_enum');
    expect(resolvePgEnumName('payouts', 'currency')).toBe('currency_enum');
    expect(resolvePgEnumName('transactions', 'currency')).toBe('currency_enum');
    expect(resolvePgEnumName('recurring_transactions', 'type')).toBe('transactions_type_enum');
    expect(resolvePgEnumName('task_templates', 'default_status')).toBe('tasks_status_enum');
    expect(resolvePgEnumName('transaction_categories', 'applicableType')).toBe('transactions_type_enum');
    expect(resolvePgEnumName('privacy_requests', 'status', 'privacy_requests_status_enum')).toBe(
      'privacy_requests_status_enum',
    );
    expect(resolvePgEnumName('bookings', 'status')).toBe('bookings_status_enum');
  });

  it('reports missing TS values against PostgreSQL labels', () => {
    const expectations: EnumExpectation[] = [
      {
        table: 'privacy_requests',
        column: 'type',
        pgEnumName: 'privacy_requests_type_enum',
        tsValues: ['DATA_EXPORT', 'DATA_DELETION'],
      },
    ];

    const pgLabels = new Map<string, Set<string>>([['privacy_requests_type_enum', new Set(['DATA_EXPORT'])]]);

    expect(findMissingEnumLabels(expectations, pgLabels)).toEqual([
      'privacy_requests.type: TS value "DATA_DELETION" missing from PostgreSQL enum "privacy_requests_type_enum"',
    ]);
  });

  it('reports missing PostgreSQL enum types', () => {
    const expectations: EnumExpectation[] = [
      {
        table: 'bookings',
        column: 'status',
        pgEnumName: 'bookings_status_enum',
        tsValues: ['DRAFT'],
      },
    ];

    expect(findMissingEnumLabels(expectations, new Map())).toEqual([
      'bookings.status: PostgreSQL enum "bookings_status_enum" not found',
    ]);
  });

  it('matches legacy lowercase PostgreSQL enum type names', () => {
    const expectations: EnumExpectation[] = [
      {
        table: 'tenants',
        column: 'subscriptionPlan',
        pgEnumName: 'tenants_subscriptionPlan_enum',
        tsValues: ['FREE', 'PRO'],
      },
    ];

    const pgLabels = new Map<string, Set<string>>([
      ['tenants_subscriptionplan_enum', new Set(['FREE', 'PRO', 'ENTERPRISE'])],
    ]);

    expect(findMissingEnumLabels(expectations, pgLabels)).toEqual([]);
  });

  it('collects enum expectations from entity metadata fixtures', () => {
    const expectations = collectEnumExpectations([
      {
        tableType: 'regular',
        tableName: 'privacy_requests',
        columns: [
          {
            databaseName: 'type',
            enum: { DATA_EXPORT: 'DATA_EXPORT', DATA_DELETION: 'DATA_DELETION' },
            enumName: 'privacy_requests_type_enum',
          },
          {
            databaseName: 'status',
            enum: { PENDING: 'PENDING', COMPLETED: 'COMPLETED' },
            enumName: 'privacy_requests_status_enum',
          },
        ],
      },
    ] as never);

    expect(expectations).toEqual([
      {
        table: 'privacy_requests',
        column: 'status',
        pgEnumName: 'privacy_requests_status_enum',
        tsValues: ['COMPLETED', 'PENDING'],
      },
      {
        table: 'privacy_requests',
        column: 'type',
        pgEnumName: 'privacy_requests_type_enum',
        tsValues: ['DATA_DELETION', 'DATA_EXPORT'],
      },
    ]);
  });
});
