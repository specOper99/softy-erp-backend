import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  BookingStatus,
  TaskStatus,
  TransactionType,
} from '../src/common/enums';

describe('Workflow Integration Tests (E2E)', () => {
  let app: INestApplication;
  let _dataSource: DataSource;
  let adminToken: string;
  let staffToken: string;
  let staffUserId: string;

  // Get passwords from environment variables
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const staffPassword = process.env.SEED_STAFF_PASSWORD;

  beforeAll(async () => {
    // Validate required environment variables
    if (!adminPassword || !staffPassword) {
      throw new Error(
        'Missing required environment variables: SEED_ADMIN_PASSWORD and/or SEED_STAFF_PASSWORD',
      );
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    _dataSource = moduleFixture.get(DataSource);

    // Login as admin (seeded user)
    const adminLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@chapters.studio', password: adminPassword });
    adminToken = adminLoginRes.body.accessToken;

    // Login as staff (seeded user)
    const staffLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'john.photographer@chapters.studio',
        password: staffPassword,
      });
    staffToken = staffLoginRes.body.accessToken;
    staffUserId = staffLoginRes.body.user.id;
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
        .get('/packages')
        .set('Authorization', `Bearer ${adminToken}`);
      packageId = packagesRes.body[0]?.id;
      if (!packageId) {
        console.log('WARNING: No packages found in database');
      }
    });

    it('should create a new booking in DRAFT status', async () => {
      const eventDate = new Date();
      eventDate.setDate(eventDate.getDate() + 7);

      const res = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          clientName: 'Integration Test Client',
          clientEmail: 'test@integration.com',
          clientPhone: '+1234567890',
          eventDate: eventDate.toISOString(),
          packageId: packageId,
          notes: 'E2E workflow test booking',
        });

      // Debug if failed
      if (res.status !== 201) {
        console.log('Create booking response:', res.status, res.body);
      }

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(BookingStatus.DRAFT);
      bookingId = res.body.id;
    });

    it('should confirm booking and create tasks', async () => {
      if (!bookingId) {
        console.log('Skipping - no booking created');
        return;
      }

      const res = await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`);

      if (res.status !== 200) {
        console.log('Confirm booking response:', res.status, res.body);
      }

      expect(res.status).toBe(200);
      expect(res.body.booking?.status || res.body.status).toBe(
        BookingStatus.CONFIRMED,
      );
    });

    it('should have created tasks for the booking', async () => {
      if (!bookingId) {
        console.log('Skipping - no booking to check');
        return;
      }

      const res = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${adminToken}`);

      const bookingTasks = res.body.filter(
        (t: any) => t.bookingId === bookingId,
      );
      expect(bookingTasks.length).toBeGreaterThan(0);
      expect(bookingTasks[0].status).toBe(TaskStatus.PENDING);
    });

    it('should have created income transaction for the booking', async () => {
      if (!bookingId) {
        console.log('Skipping - no booking to check');
        return;
      }

      const res = await request(app.getHttpServer())
        .get('/transactions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const bookingTransaction = res.body.find(
        (t: any) =>
          t.referenceId === bookingId && t.type === TransactionType.INCOME,
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
        .get('/tasks')
        .set('Authorization', `Bearer ${adminToken}`);

      const pendingTask = tasksRes.body.find(
        (t: any) => t.status === TaskStatus.PENDING,
      );

      if (pendingTask) {
        taskId = pendingTask.id;

        // Assign task to staff if not assigned
        if (!pendingTask.assignedUserId) {
          await request(app.getHttpServer())
            .patch(`/tasks/${taskId}/assign`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: staffUserId });
        }
      }
    });

    it('should start task and change status to IN_PROGRESS', async () => {
      if (!taskId) {
        console.log('Skipping - no pending task available');
        return;
      }

      const res = await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/start`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('should complete task and add to payable wallet', async () => {
      if (!taskId) {
        console.log('Skipping - no task to complete');
        return;
      }

      const res = await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.walletUpdated).toBe(true);
      expect(res.body.commissionAccrued).toBeGreaterThan(0);
    });

    it('should have updated wallet payable balance', async () => {
      const res = await request(app.getHttpServer())
        .get(`/wallets/user/${staffUserId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(parseFloat(res.body.payableBalance)).toBeGreaterThan(0);
    });
  });

  // ============ PAYROLL RUN WORKFLOW ============
  describe('Payroll Run Workflow', () => {
    it('should run payroll and create transactions', async () => {
      const res = await request(app.getHttpServer())
        .post('/hr/payroll/run')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(201);
      expect(res.body.totalEmployees).toBeGreaterThan(0);
      expect(res.body.totalPayout).toBeGreaterThan(0);
      expect(res.body.transactionIds).toBeDefined();
    });

    it('should have reset payable balances after payroll', async () => {
      const res = await request(app.getHttpServer())
        .get(`/wallets/user/${staffUserId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(parseFloat(res.body.payableBalance)).toBe(0);
    });

    it('should have created payroll transactions', async () => {
      const res = await request(app.getHttpServer())
        .get('/transactions?type=PAYROLL')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  // ============ ACCESS CONTROL TESTS ============
  describe('Access Control', () => {
    it('should deny staff access to payroll run', async () => {
      await request(app.getHttpServer())
        .post('/hr/payroll/run')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);
    });

    it('should deny unauthenticated access to bookings', async () => {
      await request(app.getHttpServer()).get('/bookings').expect(401);
    });
  });
});
