import { ConfigService } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TenantContextService } from '../../../src/common/services/tenant-context.service';
import { AuditPublisher } from '../../../src/modules/audit/audit.publisher';
import { UpdateBookingDto } from '../../../src/modules/bookings/dto';
import { Booking } from '../../../src/modules/bookings/entities/booking.entity';
import { Client } from '../../../src/modules/bookings/entities/client.entity';
import { BookingStatus } from '../../../src/modules/bookings/enums/booking-status.enum';
import { BookingPriceChangedEvent } from '../../../src/modules/bookings/events/booking-price-changed.event';
import { BookingRepository } from '../../../src/modules/bookings/repositories/booking.repository';
import { BookingStateMachineService } from '../../../src/modules/bookings/services/booking-state-machine.service';
import { BookingsService } from '../../../src/modules/bookings/services/bookings.service';
import { BookingWorkflowService } from '../../../src/modules/bookings/services/booking-workflow.service';
import { PackageItem } from '../../../src/modules/catalog/entities/package-item.entity';
import { ServicePackage } from '../../../src/modules/catalog/entities/service-package.entity';
import { TaskType } from '../../../src/modules/catalog/entities/task-type.entity';
import { Transaction } from '../../../src/modules/finance/entities/transaction.entity';
import { PaymentStatus } from '../../../src/modules/finance/enums/payment-status.enum';
import { TransactionType } from '../../../src/modules/finance/enums/transaction-type.enum';
import { FinancialReconciliationFailedEvent } from '../../../src/modules/finance/events/financial-reconciliation-failed.event';
import { BookingPriceChangedHandler } from '../../../src/modules/finance/handlers/booking-price-changed.handler';
import { FinanceService } from '../../../src/modules/finance/services/finance.service';
import { Task } from '../../../src/modules/tasks/entities/task.entity';
import { TaskStatus } from '../../../src/modules/tasks/enums/task-status.enum';
import { Tenant } from '../../../src/modules/tenants/entities/tenant.entity';

type EventBusSpy = {
  eventBus: EventBus;
  publish: jest.Mock;
  publishedEvents: unknown[];
};

type BookingFixture = {
  booking: Booking;
  taskCount: number;
};

describe('Booking -> Finance Integrity Integration', () => {
  let dataSource: DataSource;
  let tenantRepository: Repository<Tenant>;
  let clientRepository: Repository<Client>;
  let packageRepository: Repository<ServicePackage>;
  let packageItemRepository: Repository<PackageItem>;
  let taskTypeRepository: Repository<TaskType>;
  let bookingRepository: Repository<Booking>;
  let taskRepository: Repository<Task>;
  let transactionRepository: Repository<Transaction>;

  const createEventBusSpy = (): EventBusSpy => {
    const publishedEvents: unknown[] = [];
    const publish = jest.fn((event: unknown) => {
      publishedEvents.push(event);
    });

    return {
      eventBus: { publish } as unknown as EventBus,
      publish,
      publishedEvents,
    };
  };

  const createFinanceService = (eventBus: EventBus, shouldFail = false): FinanceService => {
    const findOne = jest.fn(async (id: string) => {
      if (shouldFail) {
        throw new Error('Simulated finance dependency failure');
      }

      const tenant = await tenantRepository.findOneBy({ id });
      if (!tenant) {
        throw new Error(`Tenant ${id} not found`);
      }

      return tenant;
    });

    return new FinanceService(
      {} as never,
      {
        getExchangeRate: jest.fn().mockReturnValue(1),
      } as never,
      {
        findOne,
      } as never,
      {} as never,
      {} as never,
      {
        invalidateReportCaches: jest.fn().mockResolvedValue(undefined),
      } as never,
      eventBus,
    );
  };

  const createBookingWorkflowService = (financeService: FinanceService, eventBus: EventBus): BookingWorkflowService => {
    const auditPublisher = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditPublisher;

    const configService = {
      get: jest.fn((_key: string, fallback?: number) => fallback),
    } as unknown as ConfigService;

    return new BookingWorkflowService(
      financeService,
      auditPublisher,
      dataSource,
      configService,
      eventBus,
      new BookingStateMachineService(),
    );
  };

  const createBookingsService = (eventBus: EventBus): BookingsService => {
    return new BookingsService(
      new BookingRepository(bookingRepository),
      {} as never,
      {} as never,
      dataSource,
      eventBus,
      new BookingStateMachineService(),
      {
        del: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
  };

  const createBookingFixture = async (tenantId: string): Promise<BookingFixture> => {
    const taskCount = 2;
    const subTotal = 1000;
    const taxRate = 10;
    const taxAmount = 100;
    const totalPrice = 1100;

    await tenantRepository.save({
      id: tenantId,
      name: `Tenant ${tenantId.slice(0, 8)}`,
      slug: `tenant-${tenantId.slice(0, 8)}-${uuidv4().slice(0, 8)}`,
    });

    const client = await clientRepository.save({
      name: `Client ${uuidv4()}`,
      email: `client-${uuidv4()}@test.local`,
      phone: '+1000000000',
      tenantId,
    });

    const servicePackage = await packageRepository.save({
      name: `Package ${uuidv4()}`,
      description: 'Booking-finance integration fixture',
      price: subTotal,
      tenantId,
    });

    const taskType = await taskTypeRepository.save({
      name: `TaskType ${uuidv4()}`,
      description: 'Fixture task type',
      defaultCommissionAmount: 75,
      tenantId,
    });

    await packageItemRepository.save({
      packageId: servicePackage.id,
      taskTypeId: taskType.id,
      quantity: taskCount,
      tenantId,
    });

    const booking = await bookingRepository.save({
      clientId: client.id,
      packageId: servicePackage.id,
      eventDate: new Date('2032-01-20T10:00:00.000Z'),
      startTime: null,
      status: BookingStatus.DRAFT,
      subTotal,
      taxRate,
      taxAmount,
      totalPrice,
      depositPercentage: 20,
      depositAmount: 220,
      amountPaid: 0,
      refundAmount: 0,
      paymentStatus: PaymentStatus.UNPAID,
      notes: 'Initial booking fixture',
      cancelledAt: null,
      cancellationReason: null,
      tenantId,
    });

    return { booking, taskCount };
  };

  beforeAll(async () => {
    const dbConfig = globalThis.__DB_CONFIG__!;
    dataSource = new DataSource({
      type: 'postgres',
      host: dbConfig.host,
      port: dbConfig.port,
      username: dbConfig.username,
      password: dbConfig.password,
      database: dbConfig.database,
      entities: [__dirname + '/../../../src/**/*.entity.ts'],
      synchronize: false,
    });

    await dataSource.initialize();

    tenantRepository = dataSource.getRepository(Tenant);
    clientRepository = dataSource.getRepository(Client);
    packageRepository = dataSource.getRepository(ServicePackage);
    packageItemRepository = dataSource.getRepository(PackageItem);
    taskTypeRepository = dataSource.getRepository(TaskType);
    bookingRepository = dataSource.getRepository(Booking);
    taskRepository = dataSource.getRepository(Task);
    transactionRepository = dataSource.getRepository(Transaction);
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "transactions", "tasks", "bookings", "package_items", "task_types", "service_packages", "clients", "tenants" CASCADE',
    );
  });

  it('creates booking tasks and finance transaction on successful confirmation', async () => {
    const tenantId = uuidv4();
    const { booking, taskCount } = await createBookingFixture(tenantId);

    const eventBusSpy = createEventBusSpy();
    const financeService = createFinanceService(eventBusSpy.eventBus);
    const workflowService = createBookingWorkflowService(financeService, eventBusSpy.eventBus);

    const result = await TenantContextService.run(tenantId, () => workflowService.confirmBooking(booking.id));

    expect(result.tasksCreated).toBe(taskCount);

    const persistedBooking = await bookingRepository.findOneByOrFail({ id: booking.id });
    expect(persistedBooking.status).toBe(BookingStatus.CONFIRMED);

    const tasks = await taskRepository.find({
      where: { bookingId: booking.id, tenantId },
    });
    expect(tasks).toHaveLength(taskCount);
    expect(tasks.every((task) => task.status === TaskStatus.PENDING)).toBe(true);

    const transactions = await transactionRepository.find({
      where: { bookingId: booking.id, tenantId },
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].type).toBe(TransactionType.INCOME);
    expect(Number(transactions[0].amount)).toBe(Number(booking.totalPrice));
  });

  it('rolls back confirmation when finance transaction step fails', async () => {
    const tenantId = uuidv4();
    const { booking } = await createBookingFixture(tenantId);

    const eventBusSpy = createEventBusSpy();
    const financeService = createFinanceService(eventBusSpy.eventBus, true);
    const workflowService = createBookingWorkflowService(financeService, eventBusSpy.eventBus);

    await expect(TenantContextService.run(tenantId, () => workflowService.confirmBooking(booking.id))).rejects.toThrow(
      'Simulated finance dependency failure',
    );

    const persistedBooking = await bookingRepository.findOneByOrFail({ id: booking.id });
    expect(persistedBooking.status).toBe(BookingStatus.DRAFT);
    expect(await taskRepository.countBy({ bookingId: booking.id, tenantId })).toBe(0);
    expect(await transactionRepository.countBy({ bookingId: booking.id, tenantId })).toBe(0);
  });

  it.each([
    {
      caseName: 'income adjustment for price increase',
      newSubTotal: 1200,
      newTaxAmount: 120,
      newTotalPrice: 1320,
      expectedType: TransactionType.INCOME,
      expectedDelta: 220,
    },
    {
      caseName: 'expense adjustment for price decrease',
      newSubTotal: 900,
      newTaxAmount: 90,
      newTotalPrice: 990,
      expectedType: TransactionType.EXPENSE,
      expectedDelta: 110,
    },
  ])('creates $caseName from booking price delta', async (testCase) => {
    const tenantId = uuidv4();
    const { booking } = await createBookingFixture(tenantId);

    await transactionRepository.save({
      type: TransactionType.INCOME,
      amount: Number(booking.totalPrice),
      category: 'Booking Payment',
      bookingId: booking.id,
      transactionDate: new Date('2032-01-01T00:00:00.000Z'),
      tenantId,
    });

    await bookingRepository.update(
      { id: booking.id, tenantId },
      {
        subTotal: testCase.newSubTotal,
        taxAmount: testCase.newTaxAmount,
        totalPrice: testCase.newTotalPrice,
      },
    );

    const eventBusSpy = createEventBusSpy();
    const financeService = createFinanceService(eventBusSpy.eventBus);
    const handler = new BookingPriceChangedHandler(financeService, dataSource, eventBusSpy.eventBus);

    await handler.handle(
      new BookingPriceChangedEvent(
        booking.id,
        tenantId,
        Number(booking.subTotal),
        testCase.newSubTotal,
        Number(booking.taxAmount),
        testCase.newTaxAmount,
        Number(booking.totalPrice),
        testCase.newTotalPrice,
        'Contract scope change',
      ),
    );

    const transactions = await transactionRepository.find({
      where: { bookingId: booking.id, tenantId },
      order: { createdAt: 'ASC' },
    });

    expect(transactions).toHaveLength(2);

    const adjustment = transactions.find((tx) => tx.category === 'Booking Price Adjustment');
    expect(adjustment).toBeDefined();
    expect(adjustment?.type).toBe(testCase.expectedType);
    expect(Number(adjustment?.amount)).toBe(testCase.expectedDelta);
    expect(eventBusSpy.publishedEvents.some((event) => event instanceof FinancialReconciliationFailedEvent)).toBe(
      false,
    );
  });

  it('publishes FinancialReconciliationFailedEvent and does not block booking update persistence', async () => {
    const tenantId = uuidv4();
    const { booking } = await createBookingFixture(tenantId);

    const eventBusSpy = createEventBusSpy();
    const bookingsService = createBookingsService(eventBusSpy.eventBus);

    await TenantContextService.run(tenantId, () =>
      bookingsService.update(booking.id, {
        notes: 'Updated even when reconciliation fails',
      } satisfies UpdateBookingDto),
    );

    const failingFinanceService = createFinanceService(eventBusSpy.eventBus, true);
    const handler = new BookingPriceChangedHandler(failingFinanceService, dataSource, eventBusSpy.eventBus);

    await expect(
      handler.handle(
        new BookingPriceChangedEvent(
          booking.id,
          tenantId,
          Number(booking.subTotal),
          Number(booking.subTotal) + 100,
          Number(booking.taxAmount),
          Number(booking.taxAmount) + 10,
          Number(booking.totalPrice),
          Number(booking.totalPrice) + 110,
          'Post-signature add-on request',
        ),
      ),
    ).resolves.toBeUndefined();

    const persistedBooking = await bookingRepository.findOneByOrFail({ id: booking.id, tenantId });
    expect(persistedBooking.notes).toBe('Updated even when reconciliation fails');

    const failureEvents = eventBusSpy.publishedEvents.filter(
      (event): event is FinancialReconciliationFailedEvent => event instanceof FinancialReconciliationFailedEvent,
    );
    expect(failureEvents).toHaveLength(1);
    expect(failureEvents[0].bookingId).toBe(booking.id);

    const adjustmentTransactions = await transactionRepository.find({
      where: {
        bookingId: booking.id,
        tenantId,
        category: 'Booking Price Adjustment',
      },
    });
    expect(adjustmentTransactions).toHaveLength(0);
  });
});
