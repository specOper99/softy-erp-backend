import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { Booking } from '../../src/modules/bookings/entities/booking.entity';
import { Client } from '../../src/modules/bookings/entities/client.entity';
import { BookingStatus } from '../../src/modules/bookings/enums/booking-status.enum';
import { ServicePackage } from '../../src/modules/catalog/entities/service-package.entity';
import { Transaction } from '../../src/modules/finance/entities/transaction.entity';
import { Currency } from '../../src/modules/finance/enums/currency.enum';
import { TransactionType } from '../../src/modules/finance/enums/transaction-type.enum';
import { User } from '../../src/modules/users/entities/user.entity';
import { Role } from '../../src/modules/users/enums/role.enum';

describe('Financial Report Controller (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtToken: string;
  let tenantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    dataSource = app.get(DataSource);

    // Login as Admin
    const userRepo = dataSource.getRepository(User);
    const adminUser = await userRepo.findOne({ where: { role: Role.ADMIN } });
    if (!adminUser) {
      throw new Error('No admin user found in seed data');
    }
    const adminEmail = adminUser.email;
    tenantId = adminUser.tenantId;
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChaptersERP123!';

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);

    jwtToken = loginResponse.body.accessToken;

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
    await txRepo.save({
      tenantId,
      type: TransactionType.INCOME,
      amount: 5000,
      transactionDate: new Date('2023-01-15T12:00:00Z'),
      category: 'Booking Payment',
      description: 'Payment for booking',
      exchangeRate: 1,
      currency: Currency.USD,
      bookingId: booking.id,
    } as any);
    // Expense
    await txRepo.save({
      tenantId,
      type: TransactionType.EXPENSE,
      amount: 1000,
      transactionDate: new Date('2023-01-16T10:00:00Z'),
      category: 'Equipment',
      description: 'Camera Lens',
      exchangeRate: 1,
      currency: Currency.USD,
      bookingId: booking.id, // Linked to booking for validity
    } as any);
    // Payroll
    await txRepo.save({
      tenantId,
      type: TransactionType.PAYROLL,
      amount: 2000,
      transactionDate: new Date('2023-01-20T10:00:00Z'),
      category: 'Salary',
      description: 'Staff Salary',
      exchangeRate: 1,
      currency: Currency.USD,
      bookingId: booking.id, // Linked to booking for validity
    } as any);
  }

  describe('GET /finance/reports/pnl', () => {
    it('should return P&L data for the specified period', async () => {
      const response = await request(app.getHttpServer())
        .get('/finance/reports/pnl')
        .query({ startDate: '2023-01-01', endDate: '2023-01-31' })
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      const janData = response.body.find((d) => d.period === '2023-01');
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
        .get('/finance/reports/pnl/pdf')
        .query({ startDate: '2023-01-01', endDate: '2023-01-31' })
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
        .get('/finance/reports/revenue-by-package')
        .query({ startDate: '2023-01-01', endDate: '2023-01-31' })
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      const pkgData = response.body.find((d) => d.packageName === 'Wedding Premium');
      // Note: If tests run in parallel or DB isn't reset, counts might be higher.
      // But typically E2E_DB_RESET=true ensures fresh DB or we just check > 0
      expect(pkgData).toBeDefined();
      expect(pkgData.totalRevenue).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('GET /finance/reports/revenue-by-package/pdf', () => {
    it('should return a PDF file', async () => {
      const response = await request(app.getHttpServer())
        .get('/finance/reports/revenue-by-package/pdf')
        .query({ startDate: '2023-01-01', endDate: '2023-01-31' })
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('revenue_by_package.pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });
  });
});
