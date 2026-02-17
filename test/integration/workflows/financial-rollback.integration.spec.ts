import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Booking } from '../../../src/modules/bookings/entities/booking.entity';
import { Client } from '../../../src/modules/bookings/entities/client.entity';
import { BookingStatus } from '../../../src/modules/bookings/enums/booking-status.enum';
import { ServicePackage } from '../../../src/modules/catalog/entities/service-package.entity';
import { Transaction } from '../../../src/modules/finance/entities/transaction.entity';
import { TransactionType } from '../../../src/modules/finance/enums/transaction-type.enum';

describe('Financial Transaction Rollback Integration', () => {
  let dataSource: DataSource;
  let transactionRepository: Repository<Transaction>;
  const tenantId = uuidv4();

  const createBookingWithRefs = async (manager: {
    save: (entityClass: unknown, entity: unknown) => Promise<unknown>;
  }): Promise<Booking> => {
    const client = await manager.save(Client, {
      name: `Client ${uuidv4()}`,
      email: `client-${uuidv4()}@test.com`,
      phone: '123456789',
      tenantId,
    });

    const pkg = await manager.save(ServicePackage, {
      name: `Package ${uuidv4()}`,
      description: 'Test',
      price: 1000,
      tenantId,
    });

    return manager.save(Booking, {
      clientId: client.id,
      packageId: pkg.id,
      eventDate: new Date(),
      totalPrice: 5000,
      subTotal: 5000,
      taxRate: 0,
      taxAmount: 0,
      depositPercentage: 0,
      depositAmount: 0,
      amountPaid: 0,
      refundAmount: 0,
      status: BookingStatus.DRAFT,
      tenantId,
    });
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

    transactionRepository = dataSource.getRepository(Transaction);
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE "transactions", "bookings" CASCADE');
  });

  describe('Transaction Rollback on Error', () => {
    it('should rollback all operations in transaction on error', async () => {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const booking = await createBookingWithRefs(queryRunner.manager);

        await queryRunner.manager.save(Transaction, {
          type: TransactionType.INCOME,
          amount: 1000,
          description: 'First transaction',
          bookingId: booking.id,
          tenantId,
          transactionDate: new Date(),
        });

        await queryRunner.manager.save(Transaction, {
          type: TransactionType.INCOME,
          amount: 2000,
          description: 'Second transaction',
          bookingId: booking.id,
          tenantId,
          transactionDate: new Date(),
        });

        throw new Error('Simulated error');
      } catch {
        await queryRunner.rollbackTransaction();
      } finally {
        await queryRunner.release();
      }

      const transactions = await transactionRepository.find({
        where: { tenantId },
      });

      expect(transactions).toHaveLength(0);
    });

    it('should not save transactions when transaction is rolled back', async () => {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const booking = await createBookingWithRefs(queryRunner.manager);

        await queryRunner.manager.save(Transaction, {
          type: TransactionType.EXPENSE,
          amount: 500,
          description: 'Should be rolled back',
          bookingId: booking.id,
          tenantId,
          transactionDate: new Date(),
        });

        await queryRunner.rollbackTransaction();
      } finally {
        await queryRunner.release();
      }

      const transactions = await transactionRepository.find({
        where: { tenantId },
      });

      expect(transactions).toHaveLength(0);
    });
  });

  describe('Nested Transaction Rollback', () => {
    it('should rollback only the inner transaction on nested error', async () => {
      const outerQueryRunner = dataSource.createQueryRunner();
      const innerQueryRunner = dataSource.createQueryRunner();

      await outerQueryRunner.connect();
      await innerQueryRunner.connect();

      await outerQueryRunner.startTransaction();
      await innerQueryRunner.startTransaction();

      try {
        const booking = await createBookingWithRefs(outerQueryRunner.manager);

        await outerQueryRunner.manager.save(Transaction, {
          type: TransactionType.INCOME,
          amount: 1000,
          description: 'Outer transaction - should commit',
          bookingId: booking.id,
          tenantId,
          transactionDate: new Date(),
        });

        const innerBooking = await createBookingWithRefs(innerQueryRunner.manager);

        await innerQueryRunner.manager.save(Transaction, {
          type: TransactionType.EXPENSE,
          amount: 500,
          description: 'Inner transaction - should rollback',
          bookingId: innerBooking.id,
          tenantId,
          transactionDate: new Date(),
        });

        await innerQueryRunner.rollbackTransaction();
        await outerQueryRunner.commitTransaction();
      } finally {
        await innerQueryRunner.release();
        await outerQueryRunner.release();
      }

      const transactions = await transactionRepository.find({
        where: { tenantId },
      });

      expect(transactions).toHaveLength(1);
      expect(transactions.at(0)?.description).toBe('Outer transaction - should commit');
    });
  });

  describe('Partial Rollback Scenarios', () => {
    it('should save earlier operations but rollback later operations on error', async () => {
      const queryRunner1 = dataSource.createQueryRunner();
      await queryRunner1.connect();
      await queryRunner1.startTransaction();

      try {
        const booking = await createBookingWithRefs(queryRunner1.manager);

        await queryRunner1.manager.save(Transaction, {
          type: TransactionType.INCOME,
          amount: 1000,
          description: 'Should be saved',
          bookingId: booking.id,
          tenantId,
          transactionDate: new Date(),
        });

        await queryRunner1.manager.save(Transaction, {
          type: TransactionType.INCOME,
          amount: 2000,
          description: 'Should also be saved',
          bookingId: booking.id,
          tenantId,
          transactionDate: new Date(),
        });

        await queryRunner1.commitTransaction();
      } finally {
        await queryRunner1.release();
      }

      const queryRunner2 = dataSource.createQueryRunner();
      await queryRunner2.connect();
      await queryRunner2.startTransaction();

      try {
        const booking = await createBookingWithRefs(queryRunner2.manager);

        await queryRunner2.manager.save(Transaction, {
          type: TransactionType.EXPENSE,
          amount: 500,
          description: 'Should be rolled back',
          bookingId: booking.id,
          tenantId,
          transactionDate: new Date(),
        });

        throw new Error('Error after save');
      } catch {
        await queryRunner2.rollbackTransaction();
      } finally {
        await queryRunner2.release();
      }

      const transactions = await transactionRepository.find({
        where: { tenantId },
      });

      expect(transactions).toHaveLength(2);
      expect(transactions.every((t) => !t.description.includes('rolled back'))).toBe(true);
    });
  });

  describe('Transaction Isolation', () => {
    it('should maintain isolation between concurrent transactions', async () => {
      const tenant2Id = uuidv4();

      const queryRunner1 = dataSource.createQueryRunner();
      const queryRunner2 = dataSource.createQueryRunner();

      await queryRunner1.connect();
      await queryRunner2.connect();

      await queryRunner1.startTransaction();
      await queryRunner2.startTransaction();

      try {
        const booking1 = await createBookingWithRefs(queryRunner1.manager);

        const booking2 = await createBookingWithRefs({
          save: async (entity: unknown, data: Record<string, unknown>) => {
            return queryRunner2.manager.save(entity as never, { ...data, tenantId: tenant2Id } as never);
          },
        });

        await queryRunner1.manager.save(Transaction, {
          type: TransactionType.INCOME,
          amount: 1000,
          description: 'Tenant 1 transaction',
          bookingId: booking1.id,
          tenantId,
          transactionDate: new Date(),
        });

        await queryRunner2.manager.save(Transaction, {
          type: TransactionType.INCOME,
          amount: 2000,
          description: 'Tenant 2 transaction',
          bookingId: booking2.id,
          tenantId: tenant2Id,
          transactionDate: new Date(),
        });

        await queryRunner1.commitTransaction();
        await queryRunner2.commitTransaction();
      } finally {
        await queryRunner1.release();
        await queryRunner2.release();
      }

      const tenant1Transactions = await transactionRepository.find({
        where: { tenantId },
      });

      const tenant2Transactions = await transactionRepository.find({
        where: { tenantId: tenant2Id },
      });

      expect(tenant1Transactions).toHaveLength(1);
      expect(tenant2Transactions).toHaveLength(1);
      expect(tenant1Transactions.at(0)?.tenantId).toBe(tenantId);
      expect(tenant2Transactions.at(0)?.tenantId).toBe(tenant2Id);
    });
  });

  describe('Rollback with External Dependencies', () => {
    it('should rollback related records when main record fails', async () => {
      const bookingRepository = dataSource.getRepository(Booking);

      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const booking = await queryRunner.manager.save(Booking, {
          clientId: uuidv4(),
          packageId: uuidv4(),
          eventDate: new Date(),
          totalPrice: 5000,
          subTotal: 5000,
          taxRate: 0,
          taxAmount: 0,
          depositPercentage: 0,
          depositAmount: 0,
          amountPaid: 0,
          refundAmount: 0,
          status: BookingStatus.DRAFT,
          tenantId,
        });

        await queryRunner.manager.save(Transaction, {
          type: TransactionType.INCOME,
          amount: 5000,
          description: 'Payment for booking',
          bookingId: booking.id,
          tenantId,
          transactionDate: new Date(),
        });

        throw new Error('Booking creation failed');
      } catch {
        await queryRunner.rollbackTransaction();
      } finally {
        await queryRunner.release();
      }

      const transactions = await transactionRepository.find({
        where: { tenantId },
      });

      const bookings = await bookingRepository.find({
        where: { tenantId },
      });

      expect(transactions).toHaveLength(0);
      expect(bookings).toHaveLength(0);
    });
  });
});
