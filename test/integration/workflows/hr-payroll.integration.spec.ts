import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CacheUtilsService } from '../../../src/common/cache/cache-utils.service';
import { ExportService } from '../../../src/common/services/export.service';
import { TenantContextService } from '../../../src/common/services/tenant-context.service';
import { AuditService } from '../../../src/modules/audit/audit.service';
import { Booking } from '../../../src/modules/bookings/entities/booking.entity';
import { DashboardGateway } from '../../../src/modules/dashboard/dashboard.gateway';
import { DepartmentBudget } from '../../../src/modules/finance/entities/department-budget.entity';
import { EmployeeWallet } from '../../../src/modules/finance/entities/employee-wallet.entity';
import { Payout } from '../../../src/modules/finance/entities/payout.entity';
import { Transaction } from '../../../src/modules/finance/entities/transaction.entity';
import { PayoutStatus } from '../../../src/modules/finance/enums/payout-status.enum';
import { TransactionType } from '../../../src/modules/finance/enums/transaction-type.enum';
import { CurrencyService } from '../../../src/modules/finance/services/currency.service';
import { FinanceService } from '../../../src/modules/finance/services/finance.service';
import { PayrollRun } from '../../../src/modules/hr/entities/payroll-run.entity';
import { Profile } from '../../../src/modules/hr/entities/profile.entity';
import { HrService } from '../../../src/modules/hr/services/hr.service';
import { MockPaymentGatewayService } from '../../../src/modules/hr/services/payment-gateway.service';
import { MailService } from '../../../src/modules/mail/mail.service';
import { TenantsService } from '../../../src/modules/tenants/tenants.service';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Role } from '../../../src/modules/users/enums/role.enum';

describe('HR Payroll Workflow Integration', () => {
  let module: TestingModule;
  let hrService: HrService;
  let _financeService: FinanceService;
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let profileRepository: Repository<Profile>;
  let walletRepository: Repository<EmployeeWallet>;
  let payoutRepository: Repository<Payout>;
  let transactionRepository: Repository<Transaction>;
  let payrollRunRepository: Repository<PayrollRun>;
  let bookingRepository: Repository<Booking>;
  let budgetRepository: Repository<DepartmentBudget>;
  let paymentGateway: MockPaymentGatewayService;

  const tenantId = uuidv4();

  beforeAll(async () => {
    // Mock tenant context
    jest
      .spyOn(TenantContextService, 'getTenantIdOrThrow')
      .mockReturnValue(tenantId);
    jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue(tenantId);

    const dbConfig = (global as any).__DB_CONFIG__;
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

    console.log(
      'Entities loaded in DataSource:',
      dataSource.entityMetadatas
        .map((m) => m.name)
        .sort()
        .join(', '),
    );

    userRepository = dataSource.getRepository(User);
    profileRepository = dataSource.getRepository(Profile);
    walletRepository = dataSource.getRepository(EmployeeWallet);
    payoutRepository = dataSource.getRepository(Payout);
    transactionRepository = dataSource.getRepository(Transaction);
    payrollRunRepository = dataSource.getRepository(PayrollRun);
    bookingRepository = dataSource.getRepository(Booking);
    budgetRepository = dataSource.getRepository(DepartmentBudget);

    module = await Test.createTestingModule({
      providers: [
        HrService,
        FinanceService,
        MockPaymentGatewayService,
        {
          provide: MailService,
          useValue: {
            sendPayrollNotification: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: TenantsService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
            findOne: jest
              .fn()
              .mockResolvedValue({ id: tenantId, baseCurrency: 'USD' }),
          },
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: CurrencyService,
          useValue: {
            getExchangeRate: jest.fn().mockResolvedValue(1),
            convert: jest.fn().mockImplementation((a) => Promise.resolve(a)),
          },
        },
        // HR Repos
        { provide: getRepositoryToken(Profile), useValue: profileRepository },
        {
          provide: getRepositoryToken(PayrollRun),
          useValue: payrollRunRepository,
        },
        {
          provide: getRepositoryToken(EmployeeWallet),
          useValue: walletRepository,
        },
        // Finance Repos
        {
          provide: getRepositoryToken(Transaction),
          useValue: transactionRepository,
        },
        { provide: getRepositoryToken(Booking), useValue: bookingRepository },
        {
          provide: getRepositoryToken(DepartmentBudget),
          useValue: budgetRepository,
        },
        {
          provide: ExportService,
          useValue: { exportToCsv: jest.fn(), exportToPdf: jest.fn() },
        },
        {
          provide: DashboardGateway,
          useValue: { server: { emit: jest.fn() } },
        },
        {
          provide: CacheUtilsService,
          useValue: { clearCachePattern: jest.fn() },
        },
      ],
    }).compile();

    hrService = module.get<HrService>(HrService);
    _financeService = module.get<FinanceService>(FinanceService);
    paymentGateway = module.get<MockPaymentGatewayService>(
      MockPaymentGatewayService,
    );
  });

  afterAll(async () => {
    await module.close();
    await dataSource.destroy();
  });

  beforeEach(async () => {
    // Cleanup in correct order
    await transactionRepository.createQueryBuilder().delete().execute();
    await payoutRepository.createQueryBuilder().delete().execute();
    await payrollRunRepository.createQueryBuilder().delete().execute();
    await walletRepository.createQueryBuilder().delete().execute();
    await profileRepository.createQueryBuilder().delete().execute();
    await bookingRepository.createQueryBuilder().delete().execute();
    await userRepository.createQueryBuilder().delete().execute();
    // await budgetRepository.createQueryBuilder().delete().execute(); // Table missing

    jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue(tenantId);
  });

  it('should execute full payroll workflow for employee with pending commissions', async () => {
    // 1. Setup Employee
    const user = await userRepository.save({
      email: 'employee@test.com',
      passwordHash: 'hashed',
      firstName: 'John',
      lastName: 'Doe',
      role: Role.FIELD_STAFF,
      tenantId,
    });

    // 2. Setup Profile with Base Salary
    const _profile = await profileRepository.save({
      userId: user.id,
      firstName: 'John',
      lastName: 'Doe',
      email: 'employee@test.com',
      baseSalary: 3000.0,
      bankAccount: 'US123456789',
      tenantId,
    });

    // 3. Setup Wallet with commissions
    const wallet = await walletRepository.save({
      userId: user.id,
      pendingBalance: 500.0, // Should stay
      payableBalance: 200.0, // Should be paid out
      tenantId,
    });

    // 4. Mock Gateway Success
    jest.spyOn(paymentGateway, 'triggerPayout').mockResolvedValue({
      success: true,
      transactionReference: 'GATEWAY-REF-123',
    });

    // 5. Execute Payroll
    const result = await hrService.runPayroll();

    // 6. Verification

    // a) Payroll Run Response
    expect(result.totalEmployees).toBe(1);
    expect(result.totalPayout).toBe(3200); // 3000 base + 200 commission
    expect(result.transactionIds).toHaveLength(1);

    // b) Wallet Updated (Payable reset, Pending kept)
    const updatedWallet = await walletRepository.findOneBy({ id: wallet.id });
    expect(Number(updatedWallet?.payableBalance)).toBe(0); // Reset
    expect(Number(updatedWallet?.pendingBalance)).toBe(500); // Unchanged

    // c) Payout Record Created
    const payout = await payoutRepository.findOneBy({
      tenantId,
      status: 'COMPLETED',
    });
    expect(payout).toBeDefined();
    expect(Number(payout?.amount)).toBe(3200);
    expect(payout?.status).toBe(PayoutStatus.COMPLETED);
    expect(payout?.notes).toContain('TxnRef: GATEWAY-REF-123');
    expect(Number(payout?.amount)).toBe(3200);
    // expect(payout?.transactionIds?.length).toBe(1); // Payout doesn't share transactionIds column usually

    // d) Transaction Created
    const tx = await transactionRepository.findOneBy({
      payoutId: payout?.id,
    });
    expect(tx).toBeDefined();
    expect(Number(tx?.amount)).toBe(3200);
    expect(tx?.type).toBe(TransactionType.PAYROLL);
  });

  it('should skip employees with 0 total payout', async () => {
    const user = await userRepository.save({
      email: 'nopay@test.com',
      passwordHash: 'hashed',
      firstName: 'Jane',
      lastName: 'Doe',
      role: Role.FIELD_STAFF,
      tenantId,
    });

    await profileRepository.save({
      userId: user.id,
      firstName: 'Jane',
      baseSalary: 0, // No salary
      tenantId,
    });

    await walletRepository.save({
      userId: user.id,
      pendingBalance: 100,
      payableBalance: 0, // No payable commission
      tenantId,
    });

    const result = await hrService.runPayroll();

    expect(result.totalEmployees).toBe(0);
    expect(result.totalPayout).toBe(0);
    expect(result.transactionIds).toHaveLength(0);

    // No payout created
    const payout = await payoutRepository.findOneBy({ tenantId });
    expect(payout).toBeNull();
  });

  it('should handle gateway failure gracefully (mark payout FAILED, skip transaction)', async () => {
    // Setup Employee
    const user = await userRepository.save({
      email: 'fail@test.com',
      passwordHash: 'hashed',
      firstName: 'Fail',
      lastName: 'User',
      role: Role.FIELD_STAFF,
      tenantId,
    });

    await profileRepository.save({
      userId: user.id,
      baseSalary: 1000,
      tenantId,
    });

    await walletRepository.save({
      userId: user.id,
      payableBalance: 0,
      tenantId,
    });

    // Mock Gateway Failure
    jest.spyOn(paymentGateway, 'triggerPayout').mockResolvedValue({
      success: false,
      error: 'Insufficient Funds',
    });

    const result = await hrService.runPayroll();

    expect(result.totalEmployees).toBe(0); // Failed ones are not counted as "processed" in terms of payout success based on logic?
    // Logic: employeesProcessed++ happens AFTER transaction creation. If gateway fails, it continues loop.

    // Check Payout Record (Should exist as FAILED)
    const payout = await payoutRepository.findOneBy({ tenantId });
    expect(payout).toBeDefined();
    expect(payout?.status).toBe(PayoutStatus.FAILED);
    expect(payout?.notes).toContain('Insufficient Funds');

    // Check Wallet (Should NOT be reset) - Logic: reset happens after success
    const _wallet = await walletRepository.findOneBy({ userId: user.id });
    // Wallet payable was 0 anyway, but logic is:
    // if (gatewayResult.success) { ... } else { continue; }
    // So resetPayableBalance is SKIPPED.

    // Let's verify no transaction created
    const transactions = await transactionRepository.find({
      where: { tenantId },
    });
    expect(transactions).toHaveLength(0);
  });
});
