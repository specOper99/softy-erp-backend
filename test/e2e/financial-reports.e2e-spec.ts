import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, DeepPartial } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { TransformInterceptor } from '../../src/common/interceptors';
import { Booking } from '../../src/modules/bookings/entities/booking.entity';
import { Client } from '../../src/modules/bookings/entities/client.entity';
import { BookingStatus } from '../../src/modules/bookings/enums/booking-status.enum';
import { ServicePackage } from '../../src/modules/catalog/entities/service-package.entity';
import { Transaction } from '../../src/modules/finance/entities/transaction.entity';
import { Currency } from '../../src/modules/finance/enums/currency.enum';
import { TransactionType } from '../../src/modules/finance/enums/transaction-type.enum';
import { MailService } from '../../src/modules/mail/mail.service';
import { seedTestDatabase } from '../utils/seed-data';

describe('Financial Report Controller (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtToken: string;
  let tenantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
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

    dataSource = app.get(DataSource);

    // Seed test database to get admin user and tenant
    const seedData = await seedTestDatabase(dataSource);
    tenantId = seedData.tenantId;
    const adminEmail = seedData.admin.email;
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChaptersERP123!';
    const tenantHost = `${tenantId}.example.com`;

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', tenantHost)
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);

    jwtToken = loginResponse.body.data.accessToken;
    (globalThis as { financeTenantHost?: string }).financeTenantHost = tenantHost;

    await seedFinancialData();
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedFinancialData() {
    // tenantId is already set in beforeAll
    if (!tenantId) {
      throw new Error('Tenant ID not set before seeding');
    }

    // Seed Package
    const pkgRepo = dataSource.getRepository(ServicePackage);
    let pkg = await pkgRepo.findOne({
      where: { tenantId, name: 'Wedding Premium' },
    });

    if (!pkg) {
      pkg = pkgRepo.create({
        tenantId,
        name: 'Wedding Premium',
        price: 5000,
        description: 'Test Package',
      });
      pkg = await pkgRepo.save(pkg);
    }
    const packageId = pkg.id;

    // Seed Client
    const clientRepo = dataSource.getRepository(Client);
    let client = await clientRepo.findOne({
      where: { tenantId, email: 'test.client@example.com' },
    });
    if (!client) {
      client = clientRepo.create({
        tenantId,
        name: 'Rich Client',
        email: 'test.client@example.com',
        phone: '+1234567890',
      });
      client = await clientRepo.save(client);
    }

    // Seed Booking
    const bookingRepo = dataSource.getRepository(Booking);
    const booking = bookingRepo.create({
      tenantId,
      packageId: packageId,
      clientId: client.id,
      eventDate: new Date('2023-01-15T10:00:00Z'),
      totalPrice: 5000,
      status: BookingStatus.COMPLETED,
    });
    // Link client if necessary, or assume minimal booking for finance report tests
    // NOTE: If Booking has strict FK to Client entity, we might need to create a client first.
    // Assuming for now standard seed might have clients or nullable logic.
    // Let's create a Client entity just in case due to recent schema changes mentioned in task.
    // Skipped full client creation for brevity unless test fails.

    // Actually, recent changes require Client entity.
    // Let's rely on flexible seeding or minimal requirement.
    // Update: user prompt mentions "Normalizing Client Data" task.
    // Let's try saving without client first, if it fails we add client.
    await bookingRepo.save(booking);

    // Seed Transactions
    const txRepo = dataSource.getRepository(Transaction);
    // Income
    const incomeTx: DeepPartial<Transaction> = {
      tenantId,
      type: TransactionType.INCOME,
      amount: 5000,
      transactionDate: new Date('2023-01-15T12:00:00Z'),
      category: 'Booking Payment',
      description: 'Payment for booking',
      exchangeRate: 1,
      currency: Currency.USD,
      bookingId: booking.id,
    };
    await txRepo.save(incomeTx);
    // Expense
    const expenseTx: DeepPartial<Transaction> = {
      tenantId,
      type: TransactionType.EXPENSE,
      amount: 1000,
      transactionDate: new Date('2023-01-16T10:00:00Z'),
      category: 'Equipment',
      description: 'Camera Lens',
      exchangeRate: 1,
      currency: Currency.USD,
      bookingId: booking.id, // Linked to booking for validity
    };
    await txRepo.save(expenseTx);
    // Payroll
    const payrollTx: DeepPartial<Transaction> = {
      tenantId,
      type: TransactionType.PAYROLL,
      amount: 2000,
      transactionDate: new Date('2023-01-20T10:00:00Z'),
      category: 'Salary',
      description: 'Staff Salary',
      exchangeRate: 1,
      currency: Currency.USD,
      bookingId: booking.id, // Linked to booking for validity
    };
    await txRepo.save(payrollTx);
  }

  describe('GET /finance/reports/pnl', () => {
    it('should return P&L data for the specified period', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/finance/reports/pnl')
        .query({ startDate: '2023-01-01', endDate: '2023-01-31' })
        .set('Host', (globalThis as { financeTenantHost?: string }).financeTenantHost)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      const janData = response.body.data.find((d) => d.period === '2023-01');
      expect(janData).toBeDefined();
      expect(janData.income).toBe(5000);
      expect(janData.expenses).toBe(1000);
      expect(janData.payroll).toBe(2000);
      expect(janData.net).toBe(2000); // 5000 - 1000 - 2000
    });
  });

  describe('GET /finance/reports/pnl/pdf', () => {
    it('should return a PDF file', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/finance/reports/pnl/pdf')
        .query({ startDate: '2023-01-01', endDate: '2023-01-31' })
        .set('Host', (globalThis as { financeTenantHost?: string }).financeTenantHost)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('profit_and_loss.pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe('GET /finance/reports/revenue-by-package', () => {
    it('should return revenue grouped by package', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/finance/reports/revenue-by-package')
        .query({ startDate: '2023-01-01', endDate: '2023-01-31' })
        .set('Host', (globalThis as { financeTenantHost?: string }).financeTenantHost)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      const pkgData = response.body.data.find((d) => d.packageName === 'Wedding Premium');
      // Note: If tests run in parallel or DB isn't reset, counts might be higher.
      // But typically E2E_DB_RESET=true ensures fresh DB or we just check > 0
      expect(pkgData).toBeDefined();
      expect(pkgData.totalRevenue).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('GET /finance/reports/revenue-by-package/pdf', () => {
    it('should return a PDF file', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/finance/reports/revenue-by-package/pdf')
        .query({ startDate: '2023-01-01', endDate: '2023-01-31' })
        .set('Host', (globalThis as { financeTenantHost?: string }).financeTenantHost)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('revenue_by_package.pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });
  });
});
