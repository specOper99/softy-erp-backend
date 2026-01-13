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

/**
 * Mock Repository type with all common TypeORM repository methods mocked.
 */
export type MockRepository<T extends ObjectLiteral> = {
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
export function createMockRepository<T extends ObjectLiteral>(): MockRepository<T> {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    findBy: jest.fn(),
    save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    create: jest.fn().mockImplementation((dto) => dto),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
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
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
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
  jest.spyOn(TenantContextService, 'run').mockImplementation(async (_tid: string, fn: () => Promise<unknown>) => {
    return fn();
  });
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
