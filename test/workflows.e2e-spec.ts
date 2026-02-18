import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors';
import { BookingStatus } from '../src/modules/bookings/enums/booking-status.enum';
import { DashboardGateway } from '../src/modules/dashboard/dashboard.gateway';
import { Transaction } from '../src/modules/finance/entities/transaction.entity';
import { TransactionType } from '../src/modules/finance/enums/transaction-type.enum';
import { WalletService } from '../src/modules/finance/services/wallet.service';
import { MailService } from '../src/modules/mail/mail.service';
import { Task } from '../src/modules/tasks/entities/task.entity';
import { TaskStatus } from '../src/modules/tasks/enums/task-status.enum';
import { unwrapListData } from './utils/e2e-response';
import { seedTestDatabase } from './utils/seed-data';

// Mock ThrottlerGuard to always allow requests in tests
class MockThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

const mockDashboardGateway = {
  broadcastMetricsUpdate: jest.fn(),
};

describe('Workflow Integration Tests (E2E)', () => {
  let app: INestApplication;
  let _dataSource: DataSource;
  let adminToken: string;
  let staffToken: string;
  let staffUserId: string;
  let tenantHost: string;
  let walletService: WalletService;

  beforeAll(async () => {
    // Get passwords from environment variables (after dotenv has loaded)
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    const staffPassword = process.env.SEED_STAFF_PASSWORD;

    // Validate required environment variables
    if (!adminPassword || !staffPassword) {
      throw new Error('Missing required environment variables: SEED_ADMIN_PASSWORD and/or SEED_STAFF_PASSWORD');
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
        sendBookingRescheduleNotification: jest.fn().mockResolvedValue(undefined),
        sendPaymentReceipt: jest.fn().mockResolvedValue(undefined),
        sendCancellationEmail: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(DashboardGateway)
      .useValue(mockDashboardGateway)
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
    walletService = moduleFixture.get(WalletService);

    // Seed Test DB and Get Tenant ID and Client
    const seedData = await seedTestDatabase(_dataSource);
    const { tenantId, client } = seedData;
    tenantHost = `${seedData.tenantId}.example.com`;
    globalThis.testTenantId = tenantId;
    (globalThis as unknown as { testClientId: string }).testClientId = client.id;

    // Login as admin (seeded user)
    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', tenantHost)
      .send({ email: seedData.admin.email, password: adminPassword });
    adminToken = adminLoginRes.body.data.accessToken;

    // Login as staff (seeded user)
    const staffLoginRes = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Host', tenantHost).send({
      email: seedData.staff.email,
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
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`);
      const packages = unwrapListData<{ id: string }>(packagesRes.body);
      packageId = packages[0]?.id;
      if (!packageId) {
        console.log('WARNING: No packages found in database');
      }
    });

    it('should create a new booking in DRAFT status', async () => {
      const eventDate = new Date();
      eventDate.setDate(eventDate.getDate() + 7);

      const res = await request(app.getHttpServer())
        .post('/api/v1/bookings')
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)

        .send({
          clientId: (globalThis as unknown as { testClientId: string }).testClientId,
          eventDate: eventDate.toISOString(),
          packageId: packageId,
          notes: 'E2E workflow test booking',
          startTime: '10:00',
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
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`);
      if (res.status !== 200) {
        console.log('Confirm booking response:', res.status, res.body);
      }

      expect(res.status).toBe(200);
      expect(res.body.data.booking?.status || res.body.data.status).toBe(BookingStatus.CONFIRMED);
    });

    it('should have created tasks for the booking', async () => {
      if (!bookingId) {
        console.log('Skipping - no booking to check');
        return;
      }

      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks')
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`);
      const tasks = unwrapListData<Task>(res.body);
      const bookingTasks = tasks.filter((t) => t.bookingId === bookingId);
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
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const transactions = unwrapListData<Transaction>(res.body);
      const bookingTransaction = transactions.find(
        (t) => t.bookingId === bookingId && t.type === TransactionType.INCOME,
      );
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
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`);
      const tasks = unwrapListData<Task>(tasksRes.body);
      const pendingTask = tasks.find((t) => t.status === TaskStatus.PENDING);

      if (pendingTask) {
        taskId = pendingTask.id;

        // Assign task to staff if not assigned
        if (!pendingTask.assignedUserId) {
          await request(app.getHttpServer())
            .patch(`/api/v1/tasks/${taskId}/assign`)
            .set('Host', tenantHost)
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
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('should complete task and add to payable wallet', async () => {
      if (!taskId) {
        console.log('Skipping - no task to complete');
        return;
      }

      mockDashboardGateway.broadcastMetricsUpdate.mockClear();

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${taskId}/complete`)
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.walletUpdated).toBe(true);
      expect(res.body.data.commissionAccrued).toBeGreaterThan(0);

      expect(mockDashboardGateway.broadcastMetricsUpdate).toHaveBeenCalledWith(
        globalThis.testTenantId,
        'REVENUE',
        expect.objectContaining({
          userId: staffUserId,
          balanceType: 'paid',
          reason: 'Commission moved to payable',
        }),
      );
    });

    it('should have updated wallet payable balance', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/wallets/user/${staffUserId}`)
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Number.parseFloat(res.body.data.payableBalance)).toBeGreaterThan(0);
    });

    it('should rollback task completion when wallet payable movement fails', async () => {
      const tasksRes = await request(app.getHttpServer())
        .get('/api/v1/tasks')
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const tasks = unwrapListData<Task>(tasksRes.body);
      let rollbackTask = tasks.find(
        (task) =>
          task.status === TaskStatus.PENDING &&
          Number(task.commissionSnapshot) > 0 &&
          (!task.assignedUserId || task.assignedUserId === staffUserId),
      );

      if (!rollbackTask) {
        const packagesRes = await request(app.getHttpServer())
          .get('/api/v1/packages')
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        const packageId = unwrapListData<{ id: string }>(packagesRes.body)[0]?.id;
        if (!packageId) {
          console.log('Skipping - no package available to create rollback task');
          return;
        }

        const eventDate = new Date();
        eventDate.setDate(eventDate.getDate() + 14);

        const bookingRes = await request(app.getHttpServer())
          .post('/api/v1/bookings')
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            clientId: (globalThis as unknown as { testClientId: string }).testClientId,
            eventDate: eventDate.toISOString(),
            packageId,
            notes: 'Rollback invariant booking',
            startTime: '14:00',
          })
          .expect(201);

        await request(app.getHttpServer())
          .patch(`/api/v1/bookings/${bookingRes.body.data.id}/confirm`)
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        const refreshedTasksRes = await request(app.getHttpServer())
          .get('/api/v1/tasks')
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        const refreshedTasks = unwrapListData<Task>(refreshedTasksRes.body);
        rollbackTask = refreshedTasks.find(
          (task) =>
            task.bookingId === bookingRes.body.data.id &&
            task.status === TaskStatus.PENDING &&
            Number(task.commissionSnapshot) > 0 &&
            (!task.assignedUserId || task.assignedUserId === staffUserId),
        );
      }

      if (!rollbackTask) {
        console.log('Skipping - no pending task with commission for rollback test');
        return;
      }

      if (!rollbackTask.assignedUserId) {
        await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${rollbackTask.id}/assign`)
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ userId: staffUserId })
          .expect(200);
      }

      await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${rollbackTask.id}/start`)
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const walletBeforeRes = await request(app.getHttpServer())
        .get(`/api/v1/wallets/user/${staffUserId}`)
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const pendingBefore = Number.parseFloat(walletBeforeRes.body.data.pendingBalance);
      const payableBefore = Number.parseFloat(walletBeforeRes.body.data.payableBalance);

      const moveToPayableSpy = jest
        .spyOn(walletService, 'moveToPayable')
        .mockRejectedValueOnce(new Error('Simulated moveToPayable failure'));

      try {
        const completeRes = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/${rollbackTask.id}/complete`)
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(completeRes.status).toBeGreaterThanOrEqual(400);
        expect(moveToPayableSpy).toHaveBeenCalledTimes(1);

        const persistedTask = await _dataSource.getRepository(Task).findOne({ where: { id: rollbackTask.id } });
        expect(persistedTask?.status).toBe(TaskStatus.IN_PROGRESS);

        const walletAfterRes = await request(app.getHttpServer())
          .get(`/api/v1/wallets/user/${staffUserId}`)
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(Number.parseFloat(walletAfterRes.body.data.pendingBalance)).toBeCloseTo(pendingBefore, 2);
        expect(Number.parseFloat(walletAfterRes.body.data.payableBalance)).toBeCloseTo(payableBefore, 2);
      } finally {
        moveToPayableSpy.mockRestore();
      }
    });
  });

  // ============ PAYROLL RUN WORKFLOW ============
  describe('Payroll Run Workflow', () => {
    it('should run payroll and create transactions', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/hr/payroll/run')
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(201);
      expect(res.body.data.totalEmployees).toBeGreaterThan(0);
      expect(res.body.data.totalPayout).toBeGreaterThan(0);
      expect(res.body.data.transactionIds).toBeDefined();
    });

    it('should have reset payable balances after payroll', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/wallets/user/${staffUserId}`)
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Number.parseFloat(res.body.data.payableBalance)).toBe(0);
    });

    it('should have created payroll transactions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/transactions?type=PAYROLL')
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const transactions = unwrapListData<Transaction>(res.body);
      expect(transactions.length).toBeGreaterThan(0);
    });
  });

  // ============ ACCESS CONTROL TESTS ============
  describe('Access Control', () => {
    it('should deny staff access to payroll run', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/hr/payroll/run')
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${staffToken}`)

        .expect(403);
    });

    it('should deny unauthenticated access to bookings', async () => {
      await request(app.getHttpServer()).get('/api/v1/bookings').set('Host', tenantHost).expect(401);
    });
  });
});
