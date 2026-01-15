import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Booking } from '../../../src/modules/bookings/entities/booking.entity';
import { BookingStatus } from '../../../src/modules/bookings/enums/booking-status.enum';
import { Transaction } from '../../../src/modules/finance/entities/transaction.entity';
import { TransactionType } from '../../../src/modules/finance/enums/transaction-type.enum';

describe('Financial Transaction Rollback Integration', () => {
  let dataSource: DataSource;
  let transactionRepository: Repository<Transaction>;
  const tenantId = uuidv4();

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
        await queryRunner.manager.save(Transaction, {
          type: TransactionType.INCOME,
          amount: 1000,
          description: 'First transaction',
          tenantId,
          transactionDate: new Date(),
        });

        await queryRunner.manager.save(Transaction, {
          type: TransactionType.INCOME,
          amount: 2000,
          description: 'Second transaction',
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
        await queryRunner.manager.save(Transaction, {
          type: TransactionType.EXPENSE,
          amount: 500,
          description: 'Should be rolled back',
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
        await outerQueryRunner.manager.save(Transaction, {
          type: TransactionType.INCOME,
          amount: 1000,
          description: 'Outer transaction - should commit',
          tenantId,
          transactionDate: new Date(),
        });

        await innerQueryRunner.manager.save(Transaction, {
          type: TransactionType.EXPENSE,
          amount: 500,
          description: 'Inner transaction - should rollback',
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
      expect(transactions[0].description).toBe('Outer transaction - should commit');
    });
  });

  describe('Partial Rollback Scenarios', () => {
    it('should save earlier operations but rollback later operations on error', async () => {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        await queryRunner.manager.save(Transaction, {
          type: TransactionType.INCOME,
          amount: 1000,
          description: 'Should be saved',
          tenantId,
          transactionDate: new Date(),
        });

        await queryRunner.manager.save(Transaction, {
          type: TransactionType.INCOME,
          amount: 2000,
          description: 'Should also be saved',
          tenantId,
          transactionDate: new Date(),
        });

        await queryRunner.manager.save(Transaction, {
          type: TransactionType.EXPENSE,
          amount: 500,
          description: 'Should be rolled back',
          tenantId,
          transactionDate: new Date(),
        });

        throw new Error('Error after 3 saves');
      } catch {
        await queryRunner.rollbackTransaction();
      } finally {
        await queryRunner.release();
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
        await queryRunner1.manager.save(Transaction, {
          type: TransactionType.INCOME,
          amount: 1000,
          description: 'Tenant 1 transaction',
          tenantId,
          transactionDate: new Date(),
        });

        await queryRunner2.manager.save(Transaction, {
          type: TransactionType.INCOME,
          amount: 2000,
          description: 'Tenant 2 transaction',
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
      expect(tenant1Transactions[0].tenantId).toBe(tenantId);
      expect(tenant2Transactions[0].tenantId).toBe(tenant2Id);
    });
  });

  describe('Rollback with External Dependencies', () => {
    it('should rollback related records when main record fails', async () => {
      const bookingRepository = dataSource.getRepository(Booking);

      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        await queryRunner.manager.save(Booking, {
          clientId: uuidv4(),
          packageId: uuidv4(),
          eventDate: new Date(),
          totalPrice: 5000,
          status: BookingStatus.DRAFT,
          tenantId,
        });

        await queryRunner.manager.save(Transaction, {
          type: TransactionType.INCOME,
          amount: 5000,
          description: 'Payment for booking',
          bookingId: null,
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
