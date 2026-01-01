import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  BookingStatus,
  TaskStatus,
  TransactionType,
} from '../src/common/enums';
import { TransformInterceptor } from '../src/common/interceptors';
import { MailService } from '../src/modules/mail/mail.service';
import { seedTestDatabase } from './utils/seed-data';

// Mock ThrottlerGuard to always allow requests in tests
class MockThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe('Workflow Integration Tests (E2E)', () => {
  let app: INestApplication;
  let _dataSource: DataSource;
  let adminToken: string;
  let staffToken: string;
  let staffUserId: string;

  beforeAll(async () => {
    // Get passwords from environment variables (after dotenv has loaded)
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    const staffPassword = process.env.SEED_STAFF_PASSWORD;

    // Validate required environment variables
    if (!adminPassword || !staffPassword) {
      throw new Error(
        'Missing required environment variables: SEED_ADMIN_PASSWORD and/or SEED_STAFF_PASSWORD',
      );
    }

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
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    _dataSource = moduleFixture.get(DataSource);

    // Seed Test DB and Get Tenant ID and Client
    const { tenantId, client } = await seedTestDatabase(_dataSource);
    (global as any).testTenantId = tenantId;
    (global as any).testClientId = client.id;

    // Login as admin (seeded user)
    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@chapters.studio', password: adminPassword });
    adminToken = adminLoginRes.body.data.accessToken;

    // Login as staff (seeded user)
    const staffLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'john.photographer@chapters.studio',
        password: staffPassword,
      });
    staffToken = staffLoginRes.body.data.accessToken;

    staffUserId = staffLoginRes.body.data.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ============ BOOKING CONFIRMATION WORKFLOW ============
  describe('Booking Confirmation Workflow', () => {
    let bookingId: string;
    let packageId: string;

    beforeAll(async () => {
      // Get a package ID from catalog
      const packagesRes = await request(app.getHttpServer())
        .get('/api/v1/packages')
        .set('Authorization', `Bearer ${adminToken}`);
      // Handle wrapped response format { data: [...] }
      const packages = packagesRes.body.data || packagesRes.body;
      packageId = Array.isArray(packages) ? packages[0]?.id : undefined;
      if (!packageId) {
        console.log('WARNING: No packages found in database');
      }
    });

    it('should create a new booking in DRAFT status', async () => {
      const eventDate = new Date();
      eventDate.setDate(eventDate.getDate() + 7);

      const res = await request(app.getHttpServer())
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${adminToken}`)

        .send({
          clientId: (global as any).testClientId,
          eventDate: eventDate.toISOString(),
          packageId: packageId,
          notes: 'E2E workflow test booking',
        });

      // Debug if failed
      if (res.status !== 201) {
        console.log('Create booking response:', res.status, res.body);
      }

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe(BookingStatus.DRAFT);
      bookingId = res.body.data.id;
    });

    it('should confirm booking and create tasks', async () => {
      if (!bookingId) {
        console.log('Skipping - no booking created');
        return;
      }

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/bookings/${bookingId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`);
      if (res.status !== 200) {
        console.log('Confirm booking response:', res.status, res.body);
      }

      expect(res.status).toBe(200);
      expect(res.body.data.booking?.status || res.body.data.status).toBe(
        BookingStatus.CONFIRMED,
      );
    });

    it('should have created tasks for the booking', async () => {
      if (!bookingId) {
        console.log('Skipping - no booking to check');
        return;
      }

      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${adminToken}`);
      // Handle wrapped response format { data: [...] }
      const tasks = res.body.data || res.body;
      const bookingTasks = Array.isArray(tasks)
        ? tasks.filter((t: any) => t.bookingId === bookingId)
        : [];
      expect(bookingTasks.length).toBeGreaterThan(0);
      expect(bookingTasks[0].status).toBe(TaskStatus.PENDING);
    });

    it('should have created income transaction for the booking', async () => {
      if (!bookingId) {
        console.log('Skipping - no booking to check');
        return;
      }

      const res = await request(app.getHttpServer())
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      // Handle wrapped response format { data: [...] }
      const transactions = res.body.data || res.body;
      const bookingTransaction = Array.isArray(transactions)
        ? transactions.find(
            (t: any) =>
              t.bookingId === bookingId && t.type === TransactionType.INCOME,
          )
        : undefined;
      expect(bookingTransaction).toBeDefined();
    });
  });

  // ============ TASK COMPLETION WITH COMMISSION ============
  describe('Task Completion with Commission Flow', () => {
    let taskId: string;

    beforeAll(async () => {
      // Get first pending task and assign to staff
      const tasksRes = await request(app.getHttpServer())
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${adminToken}`);
      // Handle wrapped response format { data: [...] }
      const tasks = tasksRes.body.data || tasksRes.body;
      const pendingTask = Array.isArray(tasks)
        ? tasks.find((t: any) => t.status === TaskStatus.PENDING)
        : undefined;

      if (pendingTask) {
        taskId = pendingTask.id;

        // Assign task to staff if not assigned
        if (!pendingTask.assignedUserId) {
          await request(app.getHttpServer())
            .patch(`/api/v1/tasks/${taskId}/assign`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: staffUserId })
            .expect(200);
        }
      }
    });

    it('should start task and change status to IN_PROGRESS', async () => {
      if (!taskId) {
        console.log('Skipping - no pending task available');
        return;
      }

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${taskId}/start`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('should complete task and add to payable wallet', async () => {
      if (!taskId) {
        console.log('Skipping - no task to complete');
        return;
      }

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${taskId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.walletUpdated).toBe(true);
      expect(res.body.data.commissionAccrued).toBeGreaterThan(0);
    });

    it('should have updated wallet payable balance', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/wallets/user/${staffUserId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(parseFloat(res.body.data.payableBalance)).toBeGreaterThan(0);
    });
  });

  // ============ PAYROLL RUN WORKFLOW ============
  describe('Payroll Run Workflow', () => {
    it('should run payroll and create transactions', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/hr/payroll/run')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(201);
      expect(res.body.data.totalEmployees).toBeGreaterThan(0);
      expect(res.body.data.totalPayout).toBeGreaterThan(0);
      expect(res.body.data.transactionIds).toBeDefined();
    });

    it('should have reset payable balances after payroll', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/wallets/user/${staffUserId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(parseFloat(res.body.data.payableBalance)).toBe(0);
    });

    it('should have created payroll transactions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/transactions?type=PAYROLL')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      // Handle wrapped response format { data: [...] }
      const transactions = res.body.data || res.body;
      expect(
        Array.isArray(transactions) ? transactions.length : 0,
      ).toBeGreaterThan(0);
    });
  });

  // ============ ACCESS CONTROL TESTS ============
  describe('Access Control', () => {
    it('should deny staff access to payroll run', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/hr/payroll/run')
        .set('Authorization', `Bearer ${staffToken}`)

        .expect(403);
    });

    it('should deny unauthenticated access to bookings', async () => {
      await request(app.getHttpServer()).get('/api/v1/bookings').expect(401);
    });
  });
});
