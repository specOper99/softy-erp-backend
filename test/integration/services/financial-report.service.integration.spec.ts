import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TenantContextService } from '../../../src/common/services/tenant-context.service';
import { Booking } from '../../../src/modules/bookings/entities/booking.entity';
import { Client } from '../../../src/modules/bookings/entities/client.entity';
import { BookingStatus } from '../../../src/modules/bookings/enums/booking-status.enum';
import { ServicePackage } from '../../../src/modules/catalog/entities/service-package.entity';
import { FinancialReportService } from '../../../src/modules/finance/services/financial-report.service';
import { Transaction } from '../../../src/modules/finance/entities/transaction.entity';
import { TransactionType } from '../../../src/modules/finance/enums/transaction-type.enum';
import { DepartmentBudget } from '../../../src/modules/finance/entities/department-budget.entity';
import { PurchaseInvoice } from '../../../src/modules/finance/entities/purchase-invoice.entity';
import { DepartmentBudgetRepository } from '../../../src/modules/finance/repositories/department-budget.repository';
import { PurchaseInvoiceRepository } from '../../../src/modules/finance/repositories/purchase-invoice.repository';
import { TransactionRepository } from '../../../src/modules/finance/repositories/transaction.repository';
import { Tenant } from '../../../src/modules/tenants/entities/tenant.entity';

class InMemoryCacheUtilsStub {
  private readonly store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T, _ttlMs: number): Promise<void> {
    this.store.set(key, value);
  }

  clear(): void {
    this.store.clear();
  }
}

describe('FinancialReportService Integration Tests', () => {
  let dataSource: DataSource;
  let financialReportService: FinancialReportService;

  let tenantRepository: Repository<Tenant>;
  let clientRepository: Repository<Client>;
  let packageRepository: Repository<ServicePackage>;
  let bookingRepository: Repository<Booking>;
  let transactionRepository: Repository<Transaction>;

  let cacheUtilsStub: InMemoryCacheUtilsStub;

  const createBookingFixture = async (tenantId: string, label: string, eventDate: Date): Promise<Booking> => {
    const client = await clientRepository.save({
      name: `${label} Client`,
      email: `${label.toLowerCase()}-${uuidv4()}@test.local`,
      phone: `+1${uuidv4().replace(/-/g, '').slice(0, 10)}`,
      tenantId,
    });

    const servicePackage = await packageRepository.save({
      name: `${label} Package`,
      description: `${label} package fixture`,
      price: 2000,
      durationMinutes: 90,
      requiredStaffCount: 1,
      tenantId,
    });

    return bookingRepository.save({
      clientId: client.id,
      packageId: servicePackage.id,
      eventDate,
      startTime: '09:00',
      durationMinutes: 90,
      status: BookingStatus.CONFIRMED,
      totalPrice: 2000,
      subTotal: 2000,
      taxRate: 0,
      taxAmount: 0,
      depositPercentage: 0,
      depositAmount: 0,
      amountPaid: 0,
      refundAmount: 0,
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

    tenantRepository = dataSource.getRepository(Tenant);
    clientRepository = dataSource.getRepository(Client);
    packageRepository = dataSource.getRepository(ServicePackage);
    bookingRepository = dataSource.getRepository(Booking);
    transactionRepository = dataSource.getRepository(Transaction);

    cacheUtilsStub = new InMemoryCacheUtilsStub();
    financialReportService = new FinancialReportService(
      new TransactionRepository(dataSource.getRepository(Transaction)),
      new DepartmentBudgetRepository(dataSource.getRepository(DepartmentBudget)),
      new PurchaseInvoiceRepository(dataSource.getRepository(PurchaseInvoice)),
      cacheUtilsStub as never,
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    cacheUtilsStub.clear();
    await dataSource.query(
      'TRUNCATE TABLE "transactions", "bookings", "service_packages", "clients", "tenants" CASCADE',
    );
  });

  it('excludes cross-tenant in-range transactions from tenant1 P&L report', async () => {
    const tenant1 = uuidv4();
    const tenant2 = uuidv4();

    await tenantRepository.save([
      {
        id: tenant1,
        name: 'Finance Tenant One',
        slug: `finance-tenant-one-${uuidv4().slice(0, 8)}`,
      },
      {
        id: tenant2,
        name: 'Finance Tenant Two',
        slug: `finance-tenant-two-${uuidv4().slice(0, 8)}`,
      },
    ]);

    const reportMonthDate = new Date('2031-01-15T10:00:00.000Z');
    const bookingTenant1 = await createBookingFixture(tenant1, 'Tenant1', reportMonthDate);
    const bookingTenant2 = await createBookingFixture(tenant2, 'Tenant2-LeakTrap', reportMonthDate);

    const tenant1IncomeAmount = 1200;
    const tenant2LeakAmount = 777777;

    await transactionRepository.save([
      {
        type: TransactionType.INCOME,
        amount: tenant1IncomeAmount,
        category: 'Tenant1 Revenue',
        description: 'tenant1-income-marker',
        bookingId: bookingTenant1.id,
        transactionDate: new Date('2031-01-20T08:00:00.000Z'),
        tenantId: tenant1,
      },
      {
        type: TransactionType.INCOME,
        amount: tenant2LeakAmount,
        category: 'Leak Trap Revenue',
        description: 'tenant2-leak-marker',
        bookingId: bookingTenant2.id,
        transactionDate: new Date('2031-01-21T08:00:00.000Z'),
        tenantId: tenant2,
      },
    ]);

    const report = await TenantContextService.run(tenant1, () =>
      financialReportService.getProfitAndLoss(
        {
          startDate: '2031-01-01',
          endDate: '2031-01-31',
        },
        true,
      ),
    );

    expect(report).toHaveLength(1);
    expect(report[0]).toMatchObject({
      period: '2031-01',
      income: tenant1IncomeAmount,
      expenses: 0,
      payroll: 0,
      net: tenant1IncomeAmount,
    });
    expect(report[0].income).not.toBe(tenant1IncomeAmount + tenant2LeakAmount);
  });
});
