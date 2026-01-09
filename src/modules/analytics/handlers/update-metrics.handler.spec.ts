import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookingCancelledEvent } from '../../bookings/events/booking-cancelled.event';
import { BookingConfirmedEvent } from '../../bookings/events/booking-confirmed.event';
import { PaymentRecordedEvent } from '../../bookings/events/payment-recorded.event';
import { TaskCompletedEvent } from '../../tasks/events/task-completed.event';
import { DailyMetrics } from '../entities/daily-metrics.entity';
import { UpdateMetricsHandler } from './update-metrics.handler';

// Mock DB connection or use sqlite in-memory
describe('UpdateMetricsHandler Integration', () => {
  let handler: UpdateMetricsHandler;
  let metricsRepo: Repository<DailyMetrics>;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: () => ({
            type: 'sqlite',
            database: ':memory:',
            entities: [DailyMetrics],
            synchronize: true,
          }),
          inject: [ConfigService],
        }),
        TypeOrmModule.forFeature([DailyMetrics]),
      ],
      providers: [UpdateMetricsHandler],
    }).compile();

    handler = module.get<UpdateMetricsHandler>(UpdateMetricsHandler);
    metricsRepo = module.get<Repository<DailyMetrics>>(
      getRepositoryToken(DailyMetrics),
    );
  });

  afterEach(async () => {
    await metricsRepo.clear();
  });

  it('should increment booking count ONLY (no revenue) on BookingConfirmedEvent', async () => {
    // bookingId, tenantId, clientEmail, clientName, packageName, totalPrice, eventDate
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

    const metrics = await metricsRepo.findOne({
      where: { tenantId: 'tenant-1' },
    });
    expect(metrics).toBeDefined();
    expect(metrics?.bookingsCount).toBe(1);
    expect(Number(metrics?.totalRevenue)).toBe(0); // Revenue not incremented yet
  });

  it('should increment revenue on PaymentRecordedEvent', async () => {
    // bookingId, tenantId, clientEmail, clientName, eventDate, amount, paymentMethod, reference, totalPrice, amountPaid
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

    const metrics = await metricsRepo.findOne({
      where: { tenantId: 'tenant-1' },
    });
    expect(metrics).toBeDefined();
    expect(Number(metrics?.totalRevenue)).toBe(1500);
  });

  it('should increment task count on TaskCompletedEvent', async () => {
    // taskId, tenantId, completedAt, commissionAccrued, assignedUserId
    const event = new TaskCompletedEvent(
      'task-1',
      'tenant-1',
      new Date(),
      50,
      'user-1',
    );
    await handler.handle(event);

    const metrics = await metricsRepo.findOne({
      where: { tenantId: 'tenant-1' },
    });
    expect(metrics).toBeDefined();
    expect(metrics?.tasksCompletedCount).toBe(1);
  });

  it('should increment cancellations count on BookingCancelledEvent', async () => {
    // bookingId, tenantId, clientEmail, clientName, eventDate, cancelledAt, daysBeforeEvent, cancellationReason, amountPaid, refundAmount, refundPercentage
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

    const metrics = await metricsRepo.findOne({
      where: { tenantId: 'tenant-1' },
    });
    expect(metrics).toBeDefined();
    expect(metrics?.cancellationsCount).toBe(1);
  });

  it('should aggregate multiple events correctly', async () => {
    // Booking 1 Confirmed
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
    // Booking 2 Confirmed
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
    // Payment for Booking 1
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
    // Payment for Booking 2
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

    const metrics = await metricsRepo.findOne({
      where: { tenantId: 'tenant-1' },
    });
    expect(metrics?.bookingsCount).toBe(2);
    expect(Number(metrics?.totalRevenue)).toBe(3000);
  });
});
