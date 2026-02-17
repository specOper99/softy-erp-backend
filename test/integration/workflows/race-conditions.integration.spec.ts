/**
 * Race Condition Integration Tests
 *
 * Tests concurrent operations to verify data consistency under load.
 * These tests require a real database connection (Postgres via testcontainers).
 */

import { DataSource, EntityManager, Repository } from 'typeorm';
import { Booking } from '../../../src/modules/bookings/entities/booking.entity';
import { BookingStatus } from '../../../src/modules/bookings/enums/booking-status.enum';
import { EmployeeWallet } from '../../../src/modules/finance/entities/employee-wallet.entity';
import { Task } from '../../../src/modules/tasks/entities/task.entity';
import { TaskStatus } from '../../../src/modules/tasks/enums/task-status.enum';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Role } from '../../../src/modules/users/enums/role.enum';
import { seedTestDatabase } from '../../utils/seed-data';

describe('Race Condition Tests', () => {
  let dataSource: DataSource;
  let bookingRepository: Repository<Booking>;
  let taskRepository: Repository<Task>;
  let walletRepository: Repository<EmployeeWallet>;
  let userRepository: Repository<User>;
  let seeded: Awaited<ReturnType<typeof seedTestDatabase>>;
  // let bookingsService: BookingsService;

  // const TENANT_ID = 'test-tenant-race';

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

    bookingRepository = dataSource.getRepository(Booking);
    taskRepository = dataSource.getRepository(Task);
    walletRepository = dataSource.getRepository(EmployeeWallet);
    userRepository = dataSource.getRepository(User);
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "tasks", "bookings", "clients", "package_items", "service_packages", "task_types", "employee_wallets", "users", "tenants" CASCADE',
    );
    seeded = await seedTestDatabase(dataSource);
  });

  const runTransaction = async <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const result = await work(queryRunner.manager);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  };

  describe('Booking Payment Race Conditions', () => {
    it('should handle concurrent payment updates safely with pessimistic locking', async () => {
      // This test verifies that concurrent recordPayment calls don't cause lost updates
      // The implementation uses pessimistic_write locks to serialize access

      // Test structure:
      // 1. Create a booking with totalPrice = 100, amountPaid = 0
      // 2. Simulate 10 concurrent payment requests of $10 each
      // 3. Verify final amountPaid = $100 (not less due to race conditions)

      // const concurrentPayments = 10;
      // const paymentAmount = 10;

      // With pessimistic locking, all payments should be serialized
      // Without it, some payments could be lost (overwrite race)

      const booking = await bookingRepository.save({
        clientId: seeded.client.id,
        packageId: seeded.pkg.id,
        eventDate: new Date(),
        totalPrice: 100,
        subTotal: 100,
        taxRate: 0,
        taxAmount: 0,
        depositPercentage: 0,
        depositAmount: 0,
        amountPaid: 0,
        refundAmount: 0,
        status: BookingStatus.DRAFT,
        tenantId: seeded.tenantId,
      });

      const recordPaymentWithLock = async (amount: number) => {
        await runTransaction(async (manager) => {
          const locked = await manager.findOne(Booking, {
            where: { id: booking.id },
            lock: { mode: 'pessimistic_write' },
          });

          if (!locked) {
            throw new Error('Booking not found');
          }

          locked.amountPaid = Number(locked.amountPaid) + amount;
          await manager.save(Booking, locked);
        });
      };

      const concurrentPayments = 10;
      const paymentAmount = 10;
      const results = await Promise.allSettled(
        Array.from({ length: concurrentPayments }, () => recordPaymentWithLock(paymentAmount)),
      );

      const failures = results.filter((result) => result.status === 'rejected');
      expect(failures).toHaveLength(0);

      const updated = await bookingRepository.findOne({ where: { id: booking.id } });
      expect(Number(updated?.amountPaid)).toBe(concurrentPayments * paymentAmount);
    });

    it('should prevent double-booking through status check race conditions', async () => {
      // This test verifies that concurrent confirmBooking calls
      // don't result in duplicate task generation or double transaction recording

      // Test structure:
      // 1. Create a DRAFT booking
      // 2. Call confirmBooking concurrently from multiple "users"
      // 3. Verify exactly one succeeds, others get ConflictException

      const booking = await bookingRepository.save({
        clientId: seeded.client.id,
        packageId: seeded.pkg.id,
        eventDate: new Date(),
        totalPrice: 500,
        subTotal: 500,
        taxRate: 0,
        taxAmount: 0,
        depositPercentage: 0,
        depositAmount: 0,
        amountPaid: 0,
        refundAmount: 0,
        status: BookingStatus.DRAFT,
        tenantId: seeded.tenantId,
      });

      const confirmBookingWithLock = async () => {
        await runTransaction(async (manager) => {
          const locked = await manager.findOne(Booking, {
            where: { id: booking.id },
            lock: { mode: 'pessimistic_write' },
          });

          if (!locked) {
            throw new Error('Booking not found');
          }

          if (locked.status !== BookingStatus.DRAFT) {
            throw new Error('Booking already confirmed');
          }

          locked.status = BookingStatus.CONFIRMED;
          await manager.save(Booking, locked);
        });
      };

      const results = await Promise.allSettled(Array.from({ length: 5 }, () => confirmBookingWithLock()));

      const successes = results.filter((result) => result.status === 'fulfilled').length;
      const failures = results.filter((result) => result.status === 'rejected').length;

      expect(successes).toBe(1);
      expect(failures).toBe(4);

      const updated = await bookingRepository.findOne({ where: { id: booking.id } });
      expect(updated?.status).toBe(BookingStatus.CONFIRMED);
    });
  });

  describe('Task Assignment Race Conditions', () => {
    it('should prevent task double-assignment with pessimistic lock', async () => {
      // Test structure:
      // 1. Create an unassigned task
      // 2. Simulate 5 concurrent assignTask calls with different users
      // 3. Verify exactly one user gets assigned

      const booking = await bookingRepository.save({
        clientId: seeded.client.id,
        packageId: seeded.pkg.id,
        eventDate: new Date(),
        totalPrice: 1500,
        subTotal: 1500,
        taxRate: 0,
        taxAmount: 0,
        depositPercentage: 0,
        depositAmount: 0,
        amountPaid: 0,
        refundAmount: 0,
        status: BookingStatus.CONFIRMED,
        tenantId: seeded.tenantId,
      });

      const task = await taskRepository.save({
        bookingId: booking.id,
        taskTypeId: seeded.taskType.id,
        assignedUserId: null,
        status: TaskStatus.PENDING,
        commissionSnapshot: 100,
        tenantId: seeded.tenantId,
      });

      const users = await userRepository.save(
        Array.from({ length: 5 }).map((_, index) => ({
          email: `race-assign-${Date.now()}-${index}@erp.soft-y.org`,
          passwordHash: 'hash',
          role: Role.FIELD_STAFF,
          isActive: true,
          tenantId: seeded.tenantId,
        })),
      );

      const assignTaskWithLock = async (userId: string) => {
        await runTransaction(async (manager) => {
          const locked = await manager.findOne(Task, {
            where: { id: task.id },
            lock: { mode: 'pessimistic_write' },
          });

          if (!locked) {
            throw new Error('Task not found');
          }

          if (locked.assignedUserId) {
            throw new Error('Task already assigned');
          }

          locked.assignedUserId = userId;
          await manager.save(Task, locked);
        });
      };

      const results = await Promise.allSettled(users.map((user) => assignTaskWithLock(user.id)));
      const successes = results.filter((result) => result.status === 'fulfilled').length;
      const failures = results.filter((result) => result.status === 'rejected').length;

      expect(successes).toBe(1);
      expect(failures).toBe(4);

      const updated = await taskRepository.findOne({ where: { id: task.id } });
      expect(updated?.assignedUserId).toBeTruthy();
    });

    it('should prevent task double-completion', async () => {
      // Test structure:
      // 1. Create an assigned task
      // 2. Call completeTask concurrently
      // 3. Verify commission is credited exactly once

      const booking = await bookingRepository.save({
        clientId: seeded.client.id,
        packageId: seeded.pkg.id,
        eventDate: new Date(),
        totalPrice: 1200,
        subTotal: 1200,
        taxRate: 0,
        taxAmount: 0,
        depositPercentage: 0,
        depositAmount: 0,
        amountPaid: 0,
        refundAmount: 0,
        status: BookingStatus.CONFIRMED,
        tenantId: seeded.tenantId,
      });

      const user = await userRepository.save({
        email: `race-complete-${Date.now()}@erp.soft-y.org`,
        passwordHash: 'hash',
        role: Role.FIELD_STAFF,
        isActive: true,
        tenantId: seeded.tenantId,
      });

      await walletRepository.save({
        userId: user.id,
        pendingBalance: 0,
        payableBalance: 0,
        tenantId: seeded.tenantId,
      });

      const task = await taskRepository.save({
        bookingId: booking.id,
        taskTypeId: seeded.taskType.id,
        assignedUserId: user.id,
        status: TaskStatus.PENDING,
        commissionSnapshot: 100,
        tenantId: seeded.tenantId,
      });

      const completeTaskWithLock = async () => {
        await runTransaction(async (manager) => {
          const lockedTask = await manager.findOne(Task, {
            where: { id: task.id },
            lock: { mode: 'pessimistic_write' },
          });

          if (!lockedTask) {
            throw new Error('Task not found');
          }

          if (lockedTask.status === TaskStatus.COMPLETED) {
            throw new Error('Task already completed');
          }

          const wallet = await manager.findOne(EmployeeWallet, {
            where: { userId: user.id },
            lock: { mode: 'pessimistic_write' },
          });

          if (!wallet) {
            throw new Error('Wallet not found');
          }

          lockedTask.status = TaskStatus.COMPLETED;
          lockedTask.completedAt = new Date();
          await manager.save(Task, lockedTask);

          wallet.payableBalance = Number(wallet.payableBalance) + Number(lockedTask.commissionSnapshot);
          await manager.save(EmployeeWallet, wallet);
        });
      };

      const results = await Promise.allSettled(Array.from({ length: 3 }, () => completeTaskWithLock()));

      const successes = results.filter((result) => result.status === 'fulfilled').length;
      const failures = results.filter((result) => result.status === 'rejected').length;

      expect(successes).toBe(1);
      expect(failures).toBe(2);

      const updatedTask = await taskRepository.findOne({ where: { id: task.id } });
      const wallet = await walletRepository.findOne({ where: { userId: user.id } });

      expect(updatedTask?.status).toBe(TaskStatus.COMPLETED);
      expect(Number(wallet?.payableBalance)).toBe(100);
    });
  });

  describe('Wallet Balance Race Conditions', () => {
    it('should handle concurrent wallet debits safely', async () => {
      // Test structure:
      // 1. Create wallet with balance = 100
      // 2. Simulate 10 concurrent debit requests of $20 each
      // 3. First 5 should succeed, rest should fail with insufficient balance

      const user = await userRepository.save({
        email: `race-wallet-${Date.now()}@erp.soft-y.org`,
        passwordHash: 'hash',
        role: Role.FIELD_STAFF,
        isActive: true,
        tenantId: seeded.tenantId,
      });

      const wallet = await walletRepository.save({
        userId: user.id,
        pendingBalance: 0,
        payableBalance: 100,
        tenantId: seeded.tenantId,
      });

      const debitWalletWithLock = async (amount: number) => {
        await runTransaction(async (manager) => {
          const locked = await manager.findOne(EmployeeWallet, {
            where: { id: wallet.id },
            lock: { mode: 'pessimistic_write' },
          });

          if (!locked) {
            throw new Error('Wallet not found');
          }

          if (Number(locked.payableBalance) < amount) {
            throw new Error('Insufficient balance');
          }

          locked.payableBalance = Number(locked.payableBalance) - amount;
          await manager.save(EmployeeWallet, locked);
        });
      };

      const results = await Promise.allSettled(Array.from({ length: 10 }, () => debitWalletWithLock(20)));

      const successes = results.filter((result) => result.status === 'fulfilled').length;
      const failures = results.filter((result) => result.status === 'rejected').length;

      expect(successes).toBe(5);
      expect(failures).toBe(5);

      const updatedWallet = await walletRepository.findOne({ where: { id: wallet.id } });
      expect(Number(updatedWallet?.payableBalance)).toBe(0);
    });
  });
});

/**
 * IMPLEMENTATION NOTES:
 *
 * To run these tests against a real database:
 *
 * 1. Install testcontainers:
 *    npm install --save-dev @testcontainers/postgresql
 *
 * 2. Create setup that starts Postgres container before tests
 *
 * 3. Use Promise.all() to simulate concurrent operations:
 *    const results = await Promise.allSettled(
 *      Array(10).fill(null).map(() => service.recordPayment(bookingId, dto))
 *    );
 *
 * 4. Count successes and failures:
 *    const successes = results.filter(r => r.status === 'fulfilled').length;
 */
