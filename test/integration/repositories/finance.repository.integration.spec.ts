import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Booking } from '../../../src/modules/bookings/entities/booking.entity';
import { Client } from '../../../src/modules/bookings/entities/client.entity';
import { BookingStatus } from '../../../src/modules/bookings/enums/booking-status.enum';
import { ServicePackage } from '../../../src/modules/catalog/entities/service-package.entity';
import { TaskType } from '../../../src/modules/catalog/entities/task-type.entity';
import { Invoice } from '../../../src/modules/finance/entities/invoice.entity';
import { Transaction } from '../../../src/modules/finance/entities/transaction.entity';
import { TransactionType } from '../../../src/modules/finance/enums/transaction-type.enum';
import { Task } from '../../../src/modules/tasks/entities/task.entity';
import { TaskStatus } from '../../../src/modules/tasks/enums/task-status.enum';

describe('FinanceRepository Integration Tests', () => {
  let dataSource: DataSource;
  let transactionRepository: Repository<Transaction>;
  let _invoiceRepository: Repository<Invoice>;
  let bookingRepository: Repository<Booking>;
  let taskRepository: Repository<Task>;
  let clientRepository: Repository<Client>;
  let packageRepository: Repository<ServicePackage>;
  let taskTypeRepository: Repository<TaskType>;

  const tenant1 = uuidv4();
  const tenant2 = uuidv4();

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

    transactionRepository = dataSource.getRepository(Transaction);
    _invoiceRepository = dataSource.getRepository(Invoice);
    bookingRepository = dataSource.getRepository(Booking);
    taskRepository = dataSource.getRepository(Task);
    clientRepository = dataSource.getRepository(Client);
    packageRepository = dataSource.getRepository(ServicePackage);
    taskTypeRepository = dataSource.getRepository(TaskType);
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "transactions", "invoices", "tasks", "task_types", "bookings", "service_packages", "clients" CASCADE',
    );
  });

  describe('Financial Transaction Integrity', () => {
    it('should create transaction linked to booking', async () => {
      const client = await clientRepository.save({
        name: 'Test Client',
        email: 'client@test.com',
        phone: '123456789',
        tenantId: tenant1,
      });

      const pkg = await packageRepository.save({
        name: 'Package',
        description: 'Test',
        price: 5000,
        tenantId: tenant1,
      });

      const booking = await bookingRepository.save({
        clientId: client.id,
        packageId: pkg.id,
        eventDate: new Date('2026-06-01'),
        totalPrice: 5000,
        subTotal: 5000,
        taxRate: 0,
        taxAmount: 0,
        depositPercentage: 0,
        depositAmount: 0,
        amountPaid: 0,
        refundAmount: 0,
        status: BookingStatus.CONFIRMED,
        tenantId: tenant1,
      });

      const transaction = await transactionRepository.save({
        type: TransactionType.INCOME,
        amount: 2000,
        description: 'Partial payment',
        bookingId: booking.id,
        tenantId: tenant1,
        transactionDate: new Date(),
      });

      const found = await transactionRepository.findOne({
        where: { id: transaction.id },
        relations: ['booking'],
      });

      expect(found).toBeDefined();
      expect(found?.bookingId).toBe(booking.id);
      expect(Number(found?.amount)).toBe(2000);
      expect(Number(found?.booking?.totalPrice)).toBe(5000);
    });

    it('should enforce check constraint for transaction references', async () => {
      // Attempt to create transaction without any reference (booking/task/payout)
      // This should fail due to check constraint ensuring at least one reference
      await expect(
        transactionRepository.save({
          type: TransactionType.INCOME,
          amount: 1000,
          description: 'Invalid transaction',
          tenantId: tenant1,
          transactionDate: new Date(),
          // No bookingId, taskId, or payoutId
        }),
      ).rejects.toThrow();
    });

    it('should prevent transaction with multiple references', async () => {
      const client = await clientRepository.save({
        name: 'Test Client',
        email: 'client@test.com',
        phone: '123456789',
        tenantId: tenant1,
      });

      const pkg = await packageRepository.save({
        name: 'Package',
        description: 'Test',
        price: 5000,
        tenantId: tenant1,
      });

      const booking = await bookingRepository.save({
        clientId: client.id,
        packageId: pkg.id,
        eventDate: new Date('2026-06-01'),
        totalPrice: 5000,
        subTotal: 5000,
        taxRate: 0,
        taxAmount: 0,
        depositPercentage: 0,
        depositAmount: 0,
        amountPaid: 0,
        refundAmount: 0,
        status: BookingStatus.CONFIRMED,
        tenantId: tenant1,
      });

      const taskType = await taskTypeRepository.save({
        name: 'Photography',
        description: 'Photo task',
        tenantId: tenant1,
      });

      const task = await taskRepository.save({
        taskTypeId: taskType.id,
        bookingId: booking.id,
        status: TaskStatus.PENDING,
        commissionSnapshot: 100,
        tenantId: tenant1,
      });

      // Attempt to create transaction with both booking and task references
      // This should fail due to check constraint
      await expect(
        transactionRepository.save({
          type: TransactionType.INCOME,
          amount: 1000,
          description: 'Invalid transaction',
          bookingId: booking.id,
          taskId: task.id,
          tenantId: tenant1,
          transactionDate: new Date(),
        }),
      ).rejects.toThrow();
    });
  });

  describe('Revenue Calculation Accuracy', () => {
    it('should accurately sum revenue from transactions', async () => {
      const client = await clientRepository.save({
        name: 'Test Client',
        email: 'client@test.com',
        phone: '123456789',
        tenantId: tenant1,
      });

      const pkg = await packageRepository.save({
        name: 'Package',
        description: 'Test',
        price: 10000,
        tenantId: tenant1,
      });

      const booking = await bookingRepository.save({
        clientId: client.id,
        packageId: pkg.id,
        eventDate: new Date('2026-06-01'),
        totalPrice: 10000,
        subTotal: 10000,
        taxRate: 0,
        taxAmount: 0,
        depositPercentage: 0,
        depositAmount: 0,
        amountPaid: 0,
        refundAmount: 0,
        status: BookingStatus.CONFIRMED,
        tenantId: tenant1,
      });

      // Create multiple payments
      await transactionRepository.save({
        type: TransactionType.INCOME,
        amount: 3000,
        description: 'First payment',
        bookingId: booking.id,
        tenantId: tenant1,
        transactionDate: new Date(),
      });

      await transactionRepository.save({
        type: TransactionType.INCOME,
        amount: 4000,
        description: 'Second payment',
        bookingId: booking.id,
        tenantId: tenant1,
        transactionDate: new Date(),
      });

      await transactionRepository.save({
        type: TransactionType.INCOME,
        amount: 3000,
        description: 'Final payment',
        bookingId: booking.id,
        tenantId: tenant1,
        transactionDate: new Date(),
      });

      // Calculate total revenue
      const result = await transactionRepository
        .createQueryBuilder('transaction')
        .select('SUM(transaction.amount)', 'total')
        .where('transaction.tenantId = :tenantId', { tenantId: tenant1 })
        .andWhere('transaction.type = :type', { type: TransactionType.INCOME })
        .getRawOne();

      expect(parseFloat(result.total)).toBe(10000);
    });
  });

  describe('Audit Trail Verification', () => {
    it('should maintain transaction created/updated timestamps', async () => {
      const client = await clientRepository.save({
        name: 'Test Client',
        email: 'client@test.com',
        phone: '123456789',
        tenantId: tenant1,
      });

      const pkg = await packageRepository.save({
        name: 'Package',
        description: 'Test',
        price: 5000,
        tenantId: tenant1,
      });

      const booking = await bookingRepository.save({
        clientId: client.id,
        packageId: pkg.id,
        eventDate: new Date('2026-06-01'),
        totalPrice: 5000,
        subTotal: 5000,
        taxRate: 0,
        taxAmount: 0,
        depositPercentage: 0,
        depositAmount: 0,
        amountPaid: 0,
        refundAmount: 0,
        status: BookingStatus.CONFIRMED,
        tenantId: tenant1,
      });

      const transaction = await transactionRepository.save({
        type: TransactionType.INCOME,
        amount: 2000,
        description: 'Payment',
        bookingId: booking.id,
        tenantId: tenant1,
        transactionDate: new Date(),
      });

      const created = await transactionRepository.findOne({
        where: { id: transaction.id },
      });

      expect(created?.createdAt).toBeDefined();
      expect(created?.updatedAt).toBeDefined();

      // Update transaction
      await new Promise((resolve) => setTimeout(resolve, 100));
      transaction.amount = 2500;
      await transactionRepository.save(transaction);

      const updated = await transactionRepository.findOne({
        where: { id: transaction.id },
      });

      expect(updated?.updatedAt.getTime()).toBeGreaterThan(created!.createdAt.getTime());
    });
  });

  describe('Multi-Tenant Financial Isolation', () => {
    it('should isolate financial data by tenant', async () => {
      // Setup for tenant 1
      const client1 = await clientRepository.save({
        name: 'Tenant 1 Client',
        email: 'client1@test.com',
        phone: '123456789',
        tenantId: tenant1,
      });

      const pkg1 = await packageRepository.save({
        name: 'Package 1',
        description: 'Test',
        price: 5000,
        tenantId: tenant1,
      });

      const booking1 = await bookingRepository.save({
        clientId: client1.id,
        packageId: pkg1.id,
        eventDate: new Date('2026-06-01'),
        totalPrice: 5000,
        subTotal: 5000,
        taxRate: 0,
        taxAmount: 0,
        depositPercentage: 0,
        depositAmount: 0,
        amountPaid: 0,
        refundAmount: 0,
        status: BookingStatus.CONFIRMED,
        tenantId: tenant1,
      });

      // Setup for tenant 2
      const client2 = await clientRepository.save({
        name: 'Tenant 2 Client',
        email: 'client2@test.com',
        phone: '987654321',
        tenantId: tenant2,
      });

      const pkg2 = await packageRepository.save({
        name: 'Package 2',
        description: 'Test',
        price: 8000,
        tenantId: tenant2,
      });

      const booking2 = await bookingRepository.save({
        clientId: client2.id,
        packageId: pkg2.id,
        eventDate: new Date('2026-07-01'),
        totalPrice: 8000,
        subTotal: 8000,
        taxRate: 0,
        taxAmount: 0,
        depositPercentage: 0,
        depositAmount: 0,
        amountPaid: 0,
        refundAmount: 0,
        status: BookingStatus.CONFIRMED,
        tenantId: tenant2,
      });

      // Create transactions
      await transactionRepository.save({
        type: TransactionType.INCOME,
        amount: 5000,
        description: 'Tenant 1 payment',
        bookingId: booking1.id,
        tenantId: tenant1,
        transactionDate: new Date(),
      });

      await transactionRepository.save({
        type: TransactionType.INCOME,
        amount: 8000,
        description: 'Tenant 2 payment',
        bookingId: booking2.id,
        tenantId: tenant2,
        transactionDate: new Date(),
      });

      // Verify isolation
      const tenant1Transactions = await transactionRepository.find({
        where: { tenantId: tenant1 },
      });

      const tenant2Transactions = await transactionRepository.find({
        where: { tenantId: tenant2 },
      });

      expect(tenant1Transactions).toHaveLength(1);
      expect(tenant2Transactions).toHaveLength(1);
      expect(Number(tenant1Transactions.at(0)?.amount)).toBe(5000);
      expect(Number(tenant2Transactions.at(0)?.amount)).toBe(8000);

      // Calculate revenue per tenant
      const tenant1Revenue = await transactionRepository
        .createQueryBuilder('transaction')
        .select('SUM(transaction.amount)', 'total')
        .where('transaction.tenantId = :tenantId', { tenantId: tenant1 })
        .getRawOne();

      const tenant2Revenue = await transactionRepository
        .createQueryBuilder('transaction')
        .select('SUM(transaction.amount)', 'total')
        .where('transaction.tenantId = :tenantId', { tenantId: tenant2 })
        .getRawOne();

      expect(parseFloat(tenant1Revenue.total)).toBe(5000);
      expect(parseFloat(tenant2Revenue.total)).toBe(8000);
    });
  });
});
