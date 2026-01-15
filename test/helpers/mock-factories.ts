/**
 * Centralized Test Mock Factories
 *
 * This module provides reusable mock factory functions for testing NestJS services.
 * Using these helpers ensures consistent mock behavior across test suites and
 * reduces duplication of mock boilerplate.
 *
 * @example
 * ```typescript
 * import { createMockRepository, createMockMetricsFactory } from '../../test/helpers/mock-factories';
 *
 * const mockUserRepository = createMockRepository<User>();
 * const mockMetricsFactory = createMockMetricsFactory();
 * ```
 */

import type { ObjectLiteral, Repository } from 'typeorm';
import { TenantContextService } from '../../src/common/services/tenant-context.service';

// Import entity types for type safety in mock factories
import type { Booking } from '../../src/modules/bookings/entities/booking.entity';
import type { TaskType } from '../../src/modules/catalog/entities/task-type.entity';
import type { Task } from '../../src/modules/tasks/entities/task.entity';
import type { User } from '../../src/modules/users/entities/user.entity';

// Type-safe partial entity types for mock factories
// Using intersection with Record for flexibility while maintaining type hints
type MockUser = { id: string; email: string; tenantId: string } & Record<string, unknown>;
type MockBooking = { id: string; tenantId: string } & Record<string, unknown>;
type MockTask = { id: string } & Record<string, unknown>;
type MockInvoice = { id: string; tenantId: string } & Record<string, unknown>;
type MockTransaction = { id: string; tenantId: string } & Record<string, unknown>;
type MockRecurringTransaction = { id: string; tenantId: string } & Record<string, unknown>;
type MockEmployeeWallet = { id: string; userId: string } & Record<string, unknown>;
type MockServicePackage = { id: string; tenantId: string } & Record<string, unknown>;
type MockTaskType = { id: string; tenantId: string } & Record<string, unknown>;
type MockPackageItem = { id: string; packageId: string } & Record<string, unknown>;
type MockProfile = { id: string; userId: string } & Record<string, unknown>;
type MockTimeEntry = { id: string; taskId: string } & Record<string, unknown>;
type MockAuditLog = { id: string; tenantId: string } & Record<string, unknown>;
type MockDepartmentBudget = { id: string; tenantId: string } & Record<string, unknown>;

/**
 * Mock Repository type with all common TypeORM repository methods mocked.
 * Common methods are required; others remain optional.
 */
export type MockRepository<T extends ObjectLiteral = ObjectLiteral> = {
  find: jest.Mock;
  findOne: jest.Mock;
  findOneBy: jest.Mock;
  findBy: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  remove: jest.Mock;
  softRemove: jest.Mock;
  count: jest.Mock;
  createQueryBuilder: jest.Mock;
} & {
  [K in keyof Repository<T>]?: jest.Mock;
};

/**
 * Creates a mock TypeORM repository with commonly used methods pre-mocked.
 * All methods return undefined by default; override them in individual tests.
 *
 * @example
 * ```typescript
 * const mockRepo = createMockRepository<User>();
 * mockRepo.findOne.mockResolvedValue({ id: '1', name: 'Test User' });
 * ```
 */
export function createMockRepository<T extends ObjectLiteral = ObjectLiteral>(): MockRepository<T> {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    findBy: jest.fn(),
    save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    create: jest.fn().mockImplementation((dto) => dto),
    update: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
    delete: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
    remove: jest.fn(),
    softRemove: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getCount: jest.fn().mockResolvedValue(0),
      execute: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
    })),
  };
}

/**
 * Creates a mock TenantAwareRepository with commonly used methods pre-mocked.
 * Similar to createMockRepository but with tenant-aware semantics.
 *
 * @example
 * ```typescript
 * const mockTenantRepo = createMockTenantAwareRepository<Booking>();
 * mockTenantRepo.findOne.mockResolvedValue({ id: '1', tenantId: 'tenant-1' });
 * ```
 */
export function createMockTenantAwareRepository<T extends ObjectLiteral>(): MockRepository<T> {
  return createMockRepository<T>();
}

/**
 * Creates a mock MetricsFactory with all metric types pre-mocked.
 *
 * @example
 * ```typescript
 * const mockMetricsFactory = createMockMetricsFactory();
 * // Metrics created via getOrCreateCounter will automatically track .inc() calls
 * ```
 */
export function createMockMetricsFactory() {
  return {
    getOrCreateCounter: jest.fn().mockReturnValue({
      inc: jest.fn(),
      labels: jest.fn().mockReturnThis(),
    }),
    getOrCreateHistogram: jest.fn().mockReturnValue({
      observe: jest.fn(),
      startTimer: jest.fn().mockReturnValue(jest.fn()),
      labels: jest.fn().mockReturnThis(),
    }),
    getOrCreateGauge: jest.fn().mockReturnValue({
      set: jest.fn(),
      inc: jest.fn(),
      dec: jest.fn(),
      labels: jest.fn().mockReturnThis(),
    }),
    clearAllMetrics: jest.fn(),
    removeMetric: jest.fn(),
  };
}

/**
 * Creates a mock ConfigService with common configuration keys.
 *
 * @param overrides - Key-value pairs to override default config values
 *
 * @example
 * ```typescript
 * const mockConfig = createMockConfigService({
 *   'auth.jwtSecret': 'test-secret',
 *   'database.host': 'localhost',
 * });
 * ```
 */
export function createMockConfigService(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    'auth.jwtSecret': 'test-jwt-secret-minimum-32-chars-here',
    'auth.clientSessionExpires': 3600,
    'app.port': 3000,
  };

  const config = { ...defaults, ...overrides };

  return {
    get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
      return config[key] ?? defaultValue;
    }),
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (config[key] === undefined) {
        throw new Error(`Missing config key: ${key}`);
      }
      return config[key];
    }),
  };
}

/**
 * Creates a mock JwtService with common methods.
 *
 * @example
 * ```typescript
 * const mockJwt = createMockJwtService();
 * mockJwt.verify.mockReturnValue({ sub: 'user-123', tenantId: 'tenant-1' });
 * ```
 */
export function createMockJwtService() {
  return {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
    verify: jest.fn(),
    verifyAsync: jest.fn(),
    decode: jest.fn(),
  };
}

/**
 * Creates a mock CacheManager with get/set methods.
 *
 * @example
 * ```typescript
 * const mockCache = createMockCacheManager();
 * mockCache.get.mockResolvedValue('cached-value');
 * ```
 */
export function createMockCacheManager() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Mock the TenantContextService static methods for the duration of a test.
 *
 * @param tenantId - The tenant ID to return from getTenantId
 *
 * @example
 * ```typescript
 * beforeEach(() => {
 *   mockTenantContext('tenant-123');
 * });
 *
 * afterEach(() => {
 *   jest.restoreAllMocks();
 * });
 * ```
 */
export function mockTenantContext(tenantId: string): void {
  jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue(tenantId);
  jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockReturnValue(tenantId);
  jest.spyOn(TenantContextService, 'run').mockImplementation(((_tid: string, fn: () => unknown) => {
    return fn();
  }) as typeof TenantContextService.run);
}

/**
 * Creates a mock MailService with all queue and send methods.
 *
 * @example
 * ```typescript
 * const mockMailService = createMockMailService();
 * mockMailService.sendBookingConfirmation.mockResolvedValue({ success: true });
 * ```
 */
export function createMockMailService() {
  return {
    // Queue methods (async background)
    queueBookingConfirmation: jest.fn().mockResolvedValue(undefined),
    queueTaskAssignment: jest.fn().mockResolvedValue(undefined),
    queuePayrollNotification: jest.fn().mockResolvedValue(undefined),
    queuePasswordReset: jest.fn().mockResolvedValue(undefined),
    queueEmailVerification: jest.fn().mockResolvedValue(undefined),
    queueNewDeviceLogin: jest.fn().mockResolvedValue(undefined),
    queueSuspiciousActivity: jest.fn().mockResolvedValue(undefined),
    // Direct send methods
    sendBookingConfirmation: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-id' }),
    sendTaskAssignment: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-id' }),
    sendPayrollNotification: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-id' }),
    sendMagicLink: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-id' }),
    sendPasswordReset: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-id' }),
    sendEmailVerification: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-id' }),
    sendNewDeviceLogin: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-id' }),
    sendSuspiciousActivityAlert: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-id' }),
    sendCancellationEmail: jest.fn().mockResolvedValue(undefined),
    sendPaymentReceipt: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates a mock NestJS EventEmitter2 instance.
 *
 * @example
 * ```typescript
 * const mockEventEmitter = createMockEventEmitter();
 * expect(mockEventEmitter.emit).toHaveBeenCalledWith('booking.confirmed', event);
 * ```
 */
export function createMockEventEmitter() {
  return {
    emit: jest.fn().mockReturnValue(true),
    emitAsync: jest.fn().mockResolvedValue([]),
    on: jest.fn().mockReturnThis(),
    once: jest.fn().mockReturnThis(),
    removeListener: jest.fn().mockReturnThis(),
    removeAllListeners: jest.fn().mockReturnThis(),
  };
}

/**
 * Creates a mock Logger instance for silent testing.
 *
 * @example
 * ```typescript
 * const mockLogger = createMockLogger();
 * // Inject into module: { provide: Logger, useValue: mockLogger }
 * ```
 */
export function createMockLogger() {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  };
}

/**
 * Creates a mock MinIO client with common S3-compatible operations.
 *
 * @example
 * ```typescript
 * const mockMinio = createMockMinioClient();
 * mockMinio.presignedGetObject.mockResolvedValue('https://signed-url');
 * ```
 */
export function createMockMinioClient() {
  return {
    putObject: jest.fn().mockResolvedValue({ etag: 'mock-etag' }),
    getObject: jest.fn().mockResolvedValue(Buffer.from('test')),
    removeObject: jest.fn().mockResolvedValue(undefined),
    presignedGetObject: jest.fn().mockResolvedValue('https://mock-signed-url'),
    presignedPutObject: jest.fn().mockResolvedValue('https://mock-upload-url'),
    bucketExists: jest.fn().mockResolvedValue(true),
    makeBucket: jest.fn().mockResolvedValue(undefined),
    listObjects: jest.fn().mockReturnValue({
      on: jest.fn().mockReturnThis(),
    }),
  };
}

/**
 * Creates a mock QueryRunner for testing transactions.
 * Include commonly used transaction methods and a mock manager.
 *
 * @example
 * ```typescript
 * const mockQueryRunner = createMockQueryRunner();
 * mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
 * ```
 */
export function createMockQueryRunner() {
  return {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockImplementation((entity) => entity),
    },
    isTransactionActive: true,
  };
}

/**
 * Creates a mock DataSource for testing.
 * Pre-configured to mock createQueryRunner.
 *
 * @example
 * ```typescript
 * const mockDataSource = createMockDataSource();
 * ```
 */
export function createMockDataSource() {
  const mockQueryRunner = createMockQueryRunner();
  return {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    transaction: jest.fn().mockImplementation((cb) => cb(mockQueryRunner.manager)),
    isInitialized: true,
    initialize: jest.fn().mockResolvedValue(true),
    destroy: jest.fn().mockResolvedValue(true),
  };
}

/**
 * Creates a mock CatalogService with common methods.
 *
 * @example
 * ```typescript
 * const mockCatalogService = createMockCatalogService();
 * mockCatalogService.findPackageById.mockResolvedValue({ id: 'pkg-1', price: 100 });
 * ```
 */
export function createMockCatalogService() {
  return {
    findPackageById: jest.fn().mockResolvedValue({ id: 'pkg-1', price: 100, name: 'Test Package' }),
    findTaskTypeById: jest.fn().mockResolvedValue({ id: 'task-type-1', name: 'Test Task Type' }),
    findAllPackages: jest.fn().mockResolvedValue([]),
    findAllTaskTypes: jest.fn().mockResolvedValue([]),
    createPackage: jest.fn(),
    updatePackage: jest.fn(),
    deletePackage: jest.fn(),
  };
}

/**
 * Creates a mock FinanceService with common methods.
 *
 * @example
 * ```typescript
 * const mockFinanceService = createMockFinanceService();
 * ```
 */
export function createMockFinanceService() {
  return {
    createTransaction: jest.fn().mockResolvedValue({ id: 'txn-1' }),
    createTransactionWithManager: jest.fn().mockResolvedValue({ id: 'txn-1' }),
    findAllTransactions: jest.fn().mockResolvedValue([]),
    findTransactionById: jest.fn(),
    getTransactionSummary: jest.fn().mockResolvedValue({ totalIncome: 0, totalExpenses: 0, netBalance: 0 }),
    transferPendingCommission: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates a mock AuditService with common methods.
 *
 * @example
 * ```typescript
 * const mockAuditService = createMockAuditService();
 * ```
 */
export function createMockAuditService() {
  return {
    log: jest.fn().mockResolvedValue(undefined),
    getAuditLogs: jest.fn().mockResolvedValue([]),
    verifyIntegrity: jest.fn().mockResolvedValue(true),
  };
}

/**
 * Creates a mock EventBus (CQRS) with common methods.
 *
 * @example
 * ```typescript
 * const mockEventBus = createMockEventBus();
 * expect(mockEventBus.publish).toHaveBeenCalled();
 * ```
 */
export function createMockEventBus() {
  return {
    publish: jest.fn(),
    publishAll: jest.fn(),
  };
}

/**
 * Creates a mock DashboardGateway for WebSocket testing.
 *
 * @example
 * ```typescript
 * const mockDashboardGateway = createMockDashboardGateway();
 * ```
 */
export function createMockDashboardGateway() {
  return {
    broadcastMetricsUpdate: jest.fn(),
    handleConnection: jest.fn(),
    handleDisconnect: jest.fn(),
  };
}

/**
 * Creates a mock BookingStateMachineService.
 *
 * @example
 * ```typescript
 * const mockStateMachine = createMockBookingStateMachine();
 * ```
 */
export function createMockBookingStateMachine() {
  return {
    validateTransition: jest.fn(),
    canTransition: jest.fn().mockReturnValue(true),
    getNextStates: jest.fn().mockReturnValue([]),
  };
}

/**
 * Creates a mock BullMQ Queue.
 *
 * @example
 * ```typescript
 * const mockQueue = createMockQueue();
 * ```
 */
export function createMockQueue() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    addBulk: jest.fn().mockResolvedValue([]),
    getJob: jest.fn(),
    getJobs: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates a mock User entity with default values.
 *
 * @example
 * ```typescript
 * const mockUser = createMockUser({ role: Role.ADMIN });
 * ```
 */
export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    id: 'user-uuid-123',
    email: 'test@example.com',
    tenantId: 'tenant-123',
    passwordHash: 'hashed-password',
    mfaSecret: null,
    isMfaEnabled: false,
    mfaRecoveryCodes: [],
    role: 'FIELD_STAFF' as unknown as User['role'],
    isActive: true,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    wallet: null,
    tasks: Promise.resolve([]),
    ...overrides,
  };
}

/**
 * Creates a mock Booking entity with default values.
 */
export function createMockBooking(overrides: Partial<MockBooking> = {}): MockBooking {
  return {
    id: 'booking-id-123',
    tenantId: 'tenant-123',
    clientId: 'client-1',
    packageId: 'pkg-1',
    status: 'DRAFT' as unknown as Booking['status'],
    eventDate: new Date(),
    totalPrice: 1000,
    amountPaid: 0,
    depositAmount: 200,
    paymentStatus: 'UNPAID' as unknown as Booking['paymentStatus'],
    createdAt: new Date(),
    updatedAt: new Date(),
    tasks: Promise.resolve([]),
    invoice: Promise.resolve(null),
    canBeCancelled: jest.fn().mockReturnValue(true),
    canBeCompleted: jest.fn().mockReturnValue(false),
    isTerminal: jest.fn().mockReturnValue(false),
    getRemainingBalance: jest.fn().mockReturnValue(1000),
    isFullyPaid: jest.fn().mockReturnValue(false),
    isDepositPaid: jest.fn().mockReturnValue(false),
    ...overrides,
  } as MockBooking;
}

/**
 * Creates a mock Task entity with default values.
 */
export function createMockTask(overrides: Partial<MockTask> = {}): MockTask {
  return {
    id: 'task-uuid-123',
    bookingId: 'booking-uuid-123',
    taskTypeId: 'task-type-uuid-123',
    assignedUserId: 'user-uuid-123',
    status: 'PENDING' as unknown as Task['status'],
    commissionSnapshot: 100,
    dueDate: new Date(),
    completedAt: null,
    notes: 'Test task',
    booking: {
      id: 'booking-uuid-123',
      clientId: 'client-123',
      client: { name: 'John Doe' },
    } as unknown as Booking,
    taskType: { id: 'task-type-uuid-123', name: 'Photography' } as unknown as TaskType,
    assignedUser: { id: 'user-uuid-123', email: 'user@example.com' } as unknown as User,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a mock Invoice entity with default values.
 */
export function createMockInvoice(overrides: Partial<MockInvoice> = {}): MockInvoice {
  return {
    id: 'invoice-123',
    tenantId: 'tenant-123',
    bookingId: 'booking-123',
    invoiceNumber: 'INV-20240101-1234',
    status: 'DRAFT',
    issueDate: new Date(),
    dueDate: new Date(),
    items: [
      {
        description: 'Wedding Package',
        quantity: 1,
        unitPrice: 1000,
        amount: 1000,
      },
    ],
    subTotal: 1000,
    taxTotal: 100,
    totalAmount: 1100,
    currency: 'USD',
    booking: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a mock RecurringTransaction entity with default values.
 */
export function createMockRecurringTransaction(
  overrides: Partial<MockRecurringTransaction> = {},
): MockRecurringTransaction {
  return {
    id: 'rt-123',
    tenantId: 'tenant-123',
    name: 'Monthly Rent',
    type: 'EXPENSE', // TransactionType.EXPENSE
    amount: 5000,
    currency: 'USD',
    pattern: 'MONTHLY',
    status: 'ACTIVE', // RecurringStatus.ACTIVE
    nextRunDate: new Date(),
    runCount: 0,
    calculateNextRunDate: jest.fn().mockReturnValue(new Date()),
    isComplete: jest.fn().mockReturnValue(false),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a mock Transaction entity with default values.
 */
export function createMockTransaction(overrides: Partial<MockTransaction> = {}): MockTransaction {
  return {
    id: 'txn-uuid-123',
    tenantId: 'tenant-123',
    type: 'INCOME', // TransactionType.INCOME
    amount: 1500.0,
    category: 'Booking Payment',
    bookingId: 'booking-uuid-123',
    description: 'Test transaction',
    transactionDate: new Date(),
    status: 'COMPLETED',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a mock DepartmentBudget entity with default values.
 */
export function createMockDepartmentBudget(overrides: Partial<MockDepartmentBudget> = {}): MockDepartmentBudget {
  return {
    id: 'budget-1',
    tenantId: 'tenant-123',
    department: 'Engineering',
    period: '2024-01',
    budgetAmount: 10000,
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-01-31'),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a mock EmployeeWallet entity with default values.
 */
export function createMockEmployeeWallet(overrides: Partial<MockEmployeeWallet> = {}): MockEmployeeWallet {
  return {
    id: 'wallet-1',
    userId: 'user-1',
    pendingBalance: 0,
    payableBalance: 0,
    tenantId: 'tenant-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a mock ServicePackage entity with default values.
 */
export function createMockServicePackage(overrides: Partial<MockServicePackage> = {}): MockServicePackage {
  return {
    id: 'pkg-123',
    tenantId: 'tenant-123',
    name: 'Wedding Package',
    price: 5000,
    isActive: true,
    packageItems: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a mock TaskType entity with default values.
 */
export function createMockTaskType(overrides: Partial<MockTaskType> = {}): MockTaskType {
  return {
    id: 'tt-123',
    tenantId: 'tenant-123',
    name: 'Photography',
    defaultCommissionAmount: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a mock PackageItem entity with default values.
 */
export function createMockPackageItem(overrides: Partial<MockPackageItem> = {}): MockPackageItem {
  return {
    id: 'item-123',
    packageId: 'pkg-123',
    taskTypeId: 'tt-123',
    quantity: 2,
    tenantId: 'tenant-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a mock Profile entity with default values.
 */
export function createMockProfile(overrides: Partial<MockProfile> = {}): MockProfile {
  return {
    id: 'profile-uuid-123',
    userId: 'user-uuid-123',
    firstName: 'John',
    lastName: 'Doe',
    jobTitle: 'Photographer',
    baseSalary: 2000.0,
    hireDate: new Date('2024-01-01'),
    bankAccount: '1234567890',
    phone: '+1234567890',
    emergencyContactName: 'Jane Doe',
    emergencyContactPhone: '+0987654321',
    address: '123 Main St',
    city: 'Dubai',
    country: 'UAE',
    department: 'Creative',
    team: 'Photography',
    contractType: 'FULL_TIME',
    tenantId: 'tenant-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a mock TimeEntry entity with default values.
 */
export function createMockTimeEntry(overrides: Partial<MockTimeEntry> = {}): MockTimeEntry {
  return {
    id: 'entry-uuid-123',
    taskId: 'task-uuid-123',
    userId: 'user-uuid-123',
    startTime: new Date(),
    endTime: null,
    durationMinutes: 0,
    notes: 'Test time entry',
    status: 'RUNNING',
    billable: true,
    tenantId: 'tenant-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    stop: jest.fn(),
    ...overrides,
  };
}

/**
 * Creates a mock AuditLog entity with default values.
 */
export function createMockAuditLog(overrides: Partial<MockAuditLog> = {}): MockAuditLog {
  return {
    id: 'log-uuid-123',
    tenantId: 'tenant-123',
    action: 'CREATE',
    entityName: 'User',
    entityId: 'user-uuid-123',
    userId: 'admin-uuid-123',
    oldValues: null,
    newValues: { name: 'New Entity' },
    notes: 'Audit log notes',
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    method: 'POST',
    path: '/api/v1/users',
    statusCode: 201,
    durationMs: 50,
    sequenceNumber: 1,
    previousHash: 'prev-hash-123',
    hash: 'current-hash-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    calculateHash: jest.fn().mockReturnValue('mock-calculated-hash'),
    ...overrides,
  };
}
