import { Test, TestingModule } from '@nestjs/testing';
import { BookingCancelledEvent } from '../../bookings/events/booking-cancelled.event';
import { BookingConfirmedEvent } from '../../bookings/events/booking-confirmed.event';
import { PaymentRecordedEvent } from '../../bookings/events/payment-recorded.event';
import { TaskCompletedEvent } from '../../tasks/events/task-completed.event';
import { DailyMetrics } from '../entities/daily-metrics.entity';
import { DailyMetricsRepository } from '../repositories/daily-metrics.repository';
import { UpdateMetricsHandler } from './update-metrics.handler';

// Converted to a unit test that mocks the repository to avoid native sqlite dependency
describe('UpdateMetricsHandler (unit)', () => {
  let handler: UpdateMetricsHandler;
  let metricsRepo: MockDailyMetricsRepository;

  class MockDailyMetricsRepository {
    private store = new Map<string, DailyMetrics>();

    private key(tenantId: string, date: string) {
      return `${tenantId}:${date}`;
    }

    async insert(entity: Partial<DailyMetrics>): Promise<void> {
      const k = this.key(entity.tenantId!, entity.date!);
      if (this.store.has(k)) {
        const err = new Error('UNIQUE constraint failed: daily_metrics.tenantId,date');
        // emulate TypeORM/SQLite duplicate signal
        (err as any).driverError = { code: 'SQLITE_CONSTRAINT' };
        throw err;
      }
      this.store.set(k, {
        id: 'mock-id',
        tenantId: entity.tenantId!,
        date: entity.date!,
        bookingsCount: (entity.bookingsCount as any) ?? 0,
        tasksCompletedCount: (entity.tasksCompletedCount as any) ?? 0,
        activeClientsCount: (entity.activeClientsCount as any) ?? 0,
        cancellationsCount: (entity.cancellationsCount as any) ?? 0,
        totalRevenue: (entity.totalRevenue as any) ?? 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as DailyMetrics);
    }

    async increment(criteria: Partial<DailyMetrics>, propertyPath: string, value: number): Promise<void> {
      const tenantId = (criteria as any).tenantId as string;
      const date = (criteria as any).date as string;
      const k = this.key(tenantId, date);
      const existing = this.store.get(k);
      if (!existing) {
        // create an empty row if missing
        await this.insert({ tenantId, date } as Partial<DailyMetrics>);
      }
      const row = this.store.get(k)!;
      // @ts-expect-error - dynamic update
      row[propertyPath] = (row[propertyPath] ?? 0) + value;
      this.store.set(k, row);
    }

    async findOne(opts: { where: { tenantId: string } }) {
      const tenantId = opts.where.tenantId;
      // return the first row for the tenant (tests only use single-date keys)
      for (const [k, v] of this.store.entries()) {
        if (k.startsWith(`${tenantId}:`)) return v;
      }
      return undefined;
    }

    async clear() {
      this.store.clear();
    }
  }

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UpdateMetricsHandler, { provide: DailyMetricsRepository, useClass: MockDailyMetricsRepository }],
    }).compile();

    handler = module.get(UpdateMetricsHandler);
    metricsRepo = module.get(DailyMetricsRepository) as unknown as MockDailyMetricsRepository;
  });

  afterEach(async () => {
    await metricsRepo.clear();
  });

  it('should increment booking count ONLY (no revenue) on BookingConfirmedEvent', async () => {
    const event = new BookingConfirmedEvent(
      'booking-1',
      'tenant-1',
      'client@test.com',
      'Client Name',
      'Package X',
      1500,
      new Date(),
    );
    await handler.handle(event);

    const metrics = await metricsRepo.findOne({ where: { tenantId: 'tenant-1' } });
    expect(metrics).toBeDefined();
    expect(metrics?.bookingsCount).toBe(1);
    expect(Number(metrics?.totalRevenue)).toBe(0);
  });

  it('should increment revenue on PaymentRecordedEvent', async () => {
    const event = new PaymentRecordedEvent(
      'booking-1',
      'tenant-1',
      'client@test.com',
      'Client Name',
      new Date(),
      1500,
      'Credit Card',
      'ref-123',
      1500,
      1500,
    );
    await handler.handle(event);

    const metrics = await metricsRepo.findOne({ where: { tenantId: 'tenant-1' } });
    expect(metrics).toBeDefined();
    expect(Number(metrics?.totalRevenue)).toBe(1500);
  });

  it('should increment task count on TaskCompletedEvent', async () => {
    const event = new TaskCompletedEvent('task-1', 'tenant-1', new Date(), 50, 'user-1');
    await handler.handle(event);

    const metrics = await metricsRepo.findOne({ where: { tenantId: 'tenant-1' } });
    expect(metrics).toBeDefined();
    expect(metrics?.tasksCompletedCount).toBe(1);
  });

  it('should increment cancellations count on BookingCancelledEvent', async () => {
    const event = new BookingCancelledEvent(
      'booking-1',
      'tenant-1',
      'client@test.com',
      'Client Name',
      new Date(),
      new Date(),
      2,
      'User request',
      100,
      100,
      100,
    );
    await handler.handle(event);

    const metrics = await metricsRepo.findOne({ where: { tenantId: 'tenant-1' } });
    expect(metrics).toBeDefined();
    expect(metrics?.cancellationsCount).toBe(1);
  });

  it('should aggregate multiple events correctly', async () => {
    await handler.handle(
      new BookingConfirmedEvent(
        'booking-1',
        'tenant-1',
        'client@test.com',
        'Client Name',
        'Package X',
        1000,
        new Date(),
      ),
    );
    await handler.handle(
      new BookingConfirmedEvent(
        'booking-2',
        'tenant-1',
        'client@test.com',
        'Client Name',
        'Package Y',
        2000,
        new Date(),
      ),
    );
    await handler.handle(
      new PaymentRecordedEvent(
        'booking-1',
        'tenant-1',
        'client@test.com',
        'Client Name',
        new Date(),
        1000,
        'CC',
        'ref1',
        1000,
        1000,
      ),
    );
    await handler.handle(
      new PaymentRecordedEvent(
        'booking-2',
        'tenant-1',
        'client@test.com',
        'Client Name',
        new Date(),
        2000,
        'CC',
        'ref2',
        2000,
        2000,
      ),
    );

    const metrics = await metricsRepo.findOne({ where: { tenantId: 'tenant-1' } });
    expect(metrics?.bookingsCount).toBe(2);
    expect(Number(metrics?.totalRevenue)).toBe(3000);
  });
});
