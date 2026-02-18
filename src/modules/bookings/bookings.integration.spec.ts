import { INestApplication, ValidationPipe } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TransformInterceptor } from '../../common/interceptors';
import { Client } from './entities/client.entity';
import { Booking } from './entities/booking.entity';
import { BookingStatus } from './enums/booking-status.enum';
import { ServicePackage } from '../catalog/entities/service-package.entity';
import { TaskType } from '../catalog/entities/task-type.entity';
import { PackageItem } from '../catalog/entities/package-item.entity';
import { Transaction } from '../finance/entities/transaction.entity';
import { TransactionType } from '../finance/enums/transaction-type.enum';
import { TaskTypeEligibility } from '../hr/entities/task-type-eligibility.entity';
import { MailService } from '../mail/mail.service';
import { Task } from '../tasks/entities/task.entity';
import { TaskStatus } from '../tasks/enums/task-status.enum';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/enums/role.enum';

class MockThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

type DbConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
};

type TenantFixture = {
  tenantId: string;
  tenantHost: string;
  adminToken: string;
  staffUserId: string;
  packageId: string;
  clientId: string;
};

type SeedResult = {
  tenant: Tenant;
  admin: User;
  staff: User;
  client: Client;
  servicePackage: ServicePackage;
  taskType: TaskType;
};

type RedisClosableClient = {
  quit?: () => Promise<unknown> | unknown;
  disconnect?: () => Promise<unknown> | unknown;
  end?: (flush?: boolean) => Promise<unknown> | unknown;
  close?: () => Promise<unknown> | unknown;
};

const unwrapListData = <T>(responseBody: unknown): T[] => {
  if (!responseBody || typeof responseBody !== 'object') {
    return [];
  }

  const levelOne = (responseBody as Record<string, unknown>).data;
  if (Array.isArray(levelOne)) {
    return levelOne as T[];
  }

  if (!levelOne || typeof levelOne !== 'object') {
    return [];
  }

  const levelTwo = (levelOne as Record<string, unknown>).data;
  return Array.isArray(levelTwo) ? (levelTwo as T[]) : [];
};

jest.setTimeout(120000);

const closeRedisCacheClient = async (app: INestApplication): Promise<void> => {
  const cacheManager = app.get(CACHE_MANAGER, { strict: false }) as
    | {
        store?: Record<string, unknown> & {
          getClient?: () => unknown;
        };
      }
    | undefined;

  const store = cacheManager?.store;
  if (!store) {
    return;
  }

  const seen = new Set<unknown>();
  const queue: unknown[] = [cacheManager, store];
  const candidates = new Set<RedisClosableClient>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) {
      continue;
    }

    seen.add(current);
    const record = current as Record<string, unknown>;

    const maybeClient = current as RedisClosableClient;
    if (
      typeof maybeClient.quit === 'function' ||
      typeof maybeClient.disconnect === 'function' ||
      typeof maybeClient.end === 'function' ||
      typeof maybeClient.close === 'function'
    ) {
      candidates.add(maybeClient);
    }

    for (const value of Object.values(record)) {
      if (value && typeof value === 'object' && !seen.has(value)) {
        queue.push(value);
      }
    }
  }

  if (typeof store.getClient === 'function') {
    const directClient = store.getClient() as unknown;
    if (directClient && typeof directClient === 'object') {
      candidates.add(directClient as RedisClosableClient);
    }
  }

  const uniqueClients = Array.from(candidates);

  for (const client of uniqueClients) {
    const emitter = client as {
      on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
      off?: (event: string, listener: (...args: unknown[]) => void) => unknown;
      removeListener?: (event: string, listener: (...args: unknown[]) => void) => unknown;
    };

    const ignoreError = () => undefined;

    try {
      if (typeof emitter.on === 'function') {
        emitter.on('error', ignoreError);
      }

      if (typeof client.quit === 'function') {
        await client.quit();
        continue;
      }

      if (typeof client.disconnect === 'function') {
        await client.disconnect();
        continue;
      }

      if (typeof client.end === 'function') {
        await client.end(true);
        continue;
      }

      if (typeof client.close === 'function') {
        await client.close();
      }
    } catch (error) {
      void error;
    } finally {
      if (typeof emitter.off === 'function') {
        emitter.off('error', ignoreError);
      } else if (typeof emitter.removeListener === 'function') {
        emitter.removeListener('error', ignoreError);
      }
    }
  }
};

describe('Bookings Integration - Conflict/Reschedule/Cancel', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let redisContainer: StartedTestContainer;
  let tenantRepository: Repository<Tenant>;
  let userRepository: Repository<User>;
  let clientRepository: Repository<Client>;
  let packageRepository: Repository<ServicePackage>;
  let taskTypeRepository: Repository<TaskType>;
  let packageItemRepository: Repository<PackageItem>;
  let taskRepository: Repository<Task>;
  let bookingRepository: Repository<Booking>;
  let transactionRepository: Repository<Transaction>;
  let eligibilityRepository: Repository<TaskTypeEligibility>;

  const createFutureDate = (daysAhead: number): string => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + daysAhead);
    date.setUTCHours(10, 0, 0, 0);
    return date.toISOString();
  };

  const seedTenantFixture = async (): Promise<SeedResult> => {
    const suffix = uuidv4().slice(0, 8);
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'softYERP123!';
    const staffPassword = process.env.SEED_STAFF_PASSWORD || 'softYERP123!';

    const tenant = await tenantRepository.save({
      name: `Tenant ${suffix}`,
      slug: `tenant-${suffix}`,
    });

    const [adminPasswordHash, staffPasswordHash] = await Promise.all([
      bcrypt.hash(adminPassword, 10),
      bcrypt.hash(staffPassword, 10),
    ]);

    const admin = await userRepository.save({
      email: `admin-${suffix}@example.com`,
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      isActive: true,
      emailVerified: true,
      tenantId: tenant.id,
    });

    const staff = await userRepository.save({
      email: `staff-${suffix}@example.com`,
      passwordHash: staffPasswordHash,
      role: Role.FIELD_STAFF,
      isActive: true,
      emailVerified: true,
      tenantId: tenant.id,
    });

    const client = await clientRepository.save({
      name: `Client ${suffix}`,
      email: `client-${suffix}@example.com`,
      phone: '+1234567890',
      tenantId: tenant.id,
    });

    const taskType = await taskTypeRepository.save({
      name: `TaskType ${suffix}`,
      description: 'Integration task type',
      defaultCommissionAmount: 100,
      tenantId: tenant.id,
    });

    const servicePackage = await packageRepository.save({
      name: `Package ${suffix}`,
      description: 'Integration package',
      price: 2000,
      requiredStaffCount: 1,
      durationMinutes: 60,
      tenantId: tenant.id,
    });

    await packageItemRepository.save({
      packageId: servicePackage.id,
      taskTypeId: taskType.id,
      quantity: 2,
      tenantId: tenant.id,
    });

    await eligibilityRepository.save({
      tenantId: tenant.id,
      userId: staff.id,
      taskTypeId: taskType.id,
    });

    return {
      tenant,
      admin,
      staff,
      client,
      servicePackage,
      taskType,
    };
  };

  const bootstrapTenantFixture = async (): Promise<TenantFixture> => {
    const seeded = await seedTenantFixture();
    const tenantHost = `${seeded.tenant.id}.example.com`;
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'softYERP123!';

    const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Host', tenantHost).send({
      email: seeded.admin.email,
      password: adminPassword,
    });

    expect([200, 201]).toContain(loginResponse.status);
    const adminToken = loginResponse.body?.data?.accessToken as string;
    expect(adminToken).toBeDefined();

    return {
      tenantId: seeded.tenant.id,
      tenantHost,
      adminToken,
      staffUserId: seeded.staff.id,
      packageId: seeded.servicePackage.id,
      clientId: seeded.client.id,
    };
  };

  const createBooking = async (fixture: TenantFixture, payload: { eventDate: string; startTime?: string }) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Host', fixture.tenantHost)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({
        clientId: fixture.clientId,
        packageId: fixture.packageId,
        eventDate: payload.eventDate,
        startTime: payload.startTime,
        notes: 'bookings integration scenario',
      })
      .expect(201);

    return response.body.data.id as string;
  };

  const confirmBooking = async (fixture: TenantFixture, bookingId: string) => {
    return request(app.getHttpServer())
      .patch(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Host', fixture.tenantHost)
      .set('Authorization', `Bearer ${fixture.adminToken}`);
  };

  const getBookingTasks = async (fixture: TenantFixture, bookingId: string): Promise<Task[]> => {
    const tasksResponse = await request(app.getHttpServer())
      .get('/api/v1/tasks')
      .query({ bookingId })
      .set('Host', fixture.tenantHost)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .expect(200);

    return unwrapListData<Task>(tasksResponse.body).filter((task) => task.bookingId === bookingId);
  };

  const assignBookingTasks = async (fixture: TenantFixture, bookingId: string) => {
    const tasks = await getBookingTasks(fixture, bookingId);

    for (const task of tasks) {
      await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${task.id}/assign`)
        .set('Host', fixture.tenantHost)
        .set('Authorization', `Bearer ${fixture.adminToken}`)
        .send({ userId: fixture.staffUserId })
        .expect(200);
    }
  };

  beforeAll(async () => {
    const dbConfig = (globalThis as { __DB_CONFIG__?: DbConfig }).__DB_CONFIG__;
    if (!dbConfig) {
      throw new Error('Missing global integration database config');
    }

    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = dbConfig.host;
    process.env.DB_PORT = String(dbConfig.port);
    process.env.DB_USERNAME = dbConfig.username;
    process.env.DB_PASSWORD = dbConfig.password;
    process.env.DB_DATABASE = dbConfig.database;
    process.env.DB_SYNCHRONIZE = 'false';
    process.env.DISABLE_RATE_LIMITING = 'true';
    process.env.SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'softYERP123!';
    process.env.SEED_STAFF_PASSWORD = process.env.SEED_STAFF_PASSWORD || 'softYERP123!';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'integrationJwtSecret12345678901234567890';
    process.env.PLATFORM_JWT_SECRET = process.env.PLATFORM_JWT_SECRET || 'integrationPlatformSecret123456789012345';
    process.env.CURSOR_SECRET = process.env.CURSOR_SECRET || 'integrationCursorSecret12345678901234567';

    redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/i))
      .withStartupTimeout(60000)
      .start();

    const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
    process.env.REDIS_URL = redisUrl;

    const { AppModule } = jest.requireActual('../../app.module') as {
      AppModule: new (...args: never[]) => unknown;
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useClass(MockThrottlerGuard)
      .overrideProvider(MailService)
      .useValue({
        sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
        sendTaskAssignment: jest.fn().mockResolvedValue(undefined),
        sendPayrollNotification: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    dataSource = app.get(DataSource);
    tenantRepository = dataSource.getRepository(Tenant);
    userRepository = dataSource.getRepository(User);
    clientRepository = dataSource.getRepository(Client);
    packageRepository = dataSource.getRepository(ServicePackage);
    taskTypeRepository = dataSource.getRepository(TaskType);
    packageItemRepository = dataSource.getRepository(PackageItem);
    taskRepository = dataSource.getRepository(Task);
    bookingRepository = dataSource.getRepository(Booking);
    transactionRepository = dataSource.getRepository(Transaction);
    eligibilityRepository = dataSource.getRepository(TaskTypeEligibility);
  });

  afterAll(async () => {
    if (app) {
      await closeRedisCacheClient(app);
      await app.close();
    }
  });

  it('blocks staff conflicts on create, confirm, and reschedule with BOOKING_STAFF_CONFLICT', async () => {
    const fixture = await bootstrapTenantFixture();
    const conflictEventDate = createFutureDate(30);

    const bookingAId = await createBooking(fixture, {
      eventDate: conflictEventDate,
      startTime: '10:00',
    });

    const bookingPendingConflictId = await createBooking(fixture, {
      eventDate: conflictEventDate,
      startTime: '10:00',
    });

    const confirmA = await confirmBooking(fixture, bookingAId);
    expect(confirmA.status).toBe(200);
    await assignBookingTasks(fixture, bookingAId);

    const createConflictResponse = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Host', fixture.tenantHost)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({
        clientId: fixture.clientId,
        packageId: fixture.packageId,
        eventDate: conflictEventDate,
        startTime: '10:00',
      })
      .expect(409);

    expect(createConflictResponse.body.code).toBe('BOOKING_STAFF_CONFLICT');

    const confirmConflictResponse = await confirmBooking(fixture, bookingPendingConflictId);
    expect(confirmConflictResponse.status).toBe(409);
    expect(confirmConflictResponse.body.code).toBe('BOOKING_STAFF_CONFLICT');

    const bookingToRescheduleId = await createBooking(fixture, {
      eventDate: createFutureDate(32),
      startTime: '13:00',
    });
    const confirmRescheduleSource = await confirmBooking(fixture, bookingToRescheduleId);
    expect(confirmRescheduleSource.status).toBe(200);

    const rescheduleConflictResponse = await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${bookingToRescheduleId}/reschedule`)
      .set('Host', fixture.tenantHost)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({
        eventDate: conflictEventDate,
        startTime: '10:00',
      })
      .expect(409);

    expect(rescheduleConflictResponse.body.code).toBe('BOOKING_STAFF_CONFLICT');
  });

  it('blocks reschedule when tasks are in progress', async () => {
    const fixture = await bootstrapTenantFixture();

    const bookingId = await createBooking(fixture, {
      eventDate: createFutureDate(40),
      startTime: '09:30',
    });

    const confirmResponse = await confirmBooking(fixture, bookingId);
    expect(confirmResponse.status).toBe(200);

    const bookingTasks = await getBookingTasks(fixture, bookingId);
    expect(bookingTasks.length).toBeGreaterThan(0);
    const taskToStart = bookingTasks[0];
    if (!taskToStart) {
      throw new Error('Expected at least one task for booking');
    }

    await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskToStart.id}/start`)
      .set('Host', fixture.tenantHost)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .expect(200);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${bookingId}/reschedule`)
      .set('Host', fixture.tenantHost)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({
        eventDate: createFutureDate(45),
        startTime: '11:00',
      })
      .expect(400);

    expect(response.body.message).toContain('booking.cannot_reschedule_with_in_progress_tasks');
  });

  it('cancels booking with one reversal transaction and remains idempotent on repeated cancel', async () => {
    const fixture = await bootstrapTenantFixture();

    const bookingId = await createBooking(fixture, {
      eventDate: createFutureDate(50),
      startTime: '14:00',
    });

    const confirmResponse = await confirmBooking(fixture, bookingId);
    expect(confirmResponse.status).toBe(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${bookingId}/cancel`)
      .set('Host', fixture.tenantHost)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({ reason: 'Client requested cancellation' })
      .expect(200);

    const cancelledBooking = await bookingRepository.findOneByOrFail({
      id: bookingId,
      tenantId: fixture.tenantId,
    });
    expect(cancelledBooking.status).toBe(BookingStatus.CANCELLED);

    const bookingTasks = await taskRepository.find({
      where: { bookingId, tenantId: fixture.tenantId },
    });
    expect(bookingTasks.length).toBeGreaterThan(0);
    expect(bookingTasks.every((task) => task.status === TaskStatus.CANCELLED)).toBe(true);

    const bookingTransactions = await transactionRepository.find({
      where: {
        bookingId,
        tenantId: fixture.tenantId,
        type: TransactionType.INCOME,
      },
    });

    const positiveIncome = bookingTransactions.filter((transaction) => Number(transaction.amount) > 0);
    const reversalIncome = bookingTransactions.filter((transaction) => Number(transaction.amount) < 0);

    expect(positiveIncome.length).toBeGreaterThan(0);
    expect(reversalIncome).toHaveLength(1);
    const firstReversal = reversalIncome[0];
    if (!firstReversal) {
      throw new Error('Expected one reversal transaction after cancellation');
    }
    expect(Number(firstReversal.amount)).toBeLessThan(0);

    await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${bookingId}/cancel`)
      .set('Host', fixture.tenantHost)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({ reason: 'Duplicate cancellation retry' })
      .expect(200);

    const transactionsAfterRetry = await transactionRepository.find({
      where: {
        bookingId,
        tenantId: fixture.tenantId,
        type: TransactionType.INCOME,
      },
    });

    const reversalAfterRetry = transactionsAfterRetry.filter((transaction) => Number(transaction.amount) < 0);
    expect(reversalAfterRetry).toHaveLength(1);
  });
});
