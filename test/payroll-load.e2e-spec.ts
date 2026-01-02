import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors';
import { EmployeeWallet } from '../src/modules/finance/entities/employee-wallet.entity';
import { Profile } from '../src/modules/hr/entities/profile.entity';
import { MailService } from '../src/modules/mail/mail.service';
import { User } from '../src/modules/users/entities/user.entity';
import { seedTestDatabase } from './utils/seed-data';

class MockThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe('Payroll Load E2E Tests', () => {
  let app: INestApplication;
  let accessToken: string;
  let tenantId: string;
  let dataSource: DataSource;

  beforeAll(async () => {
    // Increase timeout for this setup as it might take a while to seed
    jest.setTimeout(60000);

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
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    dataSource = app.get(DataSource);
    const seedData = await seedTestDatabase(dataSource);
    tenantId = seedData.tenantId;

    // Login as admin
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: seedData.admin.email,
        password: process.env.SEED_ADMIN_PASSWORD || 'ChaptersERP123!',
      });

    accessToken = loginResponse.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should run payroll in batches for > 100 employees', async () => {
    // 1. Seed 110 users (Batch size is 100)
    const userCount = 110;
    const userRepo = dataSource.getRepository(User);
    const profileRepo = dataSource.getRepository(Profile);
    const walletRepo = dataSource.getRepository(EmployeeWallet);

    const usersToCreate = [];
    const profilesToCreate = [];
    const walletsToCreate = [];

    // Create users first
    for (let i = 0; i < userCount; i++) {
      const user = userRepo.create({
        email: `payroll-test-user-${i}-${Date.now()}@test.com`,
        passwordHash: 'hash',
        role: Role.FIELD_STAFF,
        tenantId,
        isActive: true,
      });
      usersToCreate.push(user);
    }
    const savedUsers = await userRepo.save(usersToCreate);

    // Create profiles and wallets
    for (let i = 0; i < savedUsers.length; i++) {
      const user = savedUsers[i];
      profilesToCreate.push(
        profileRepo.create({
          userId: user.id,
          firstName: `User${i}`,
          lastName: 'Test',
          baseSalary: 1000,
          tenantId,
        }),
      );

      walletsToCreate.push(
        walletRepo.create({
          userId: user.id,
          tenantId,
          pendingBalance: 0,
          payableBalance: 500, // Commission
        }),
      );
    }

    await profileRepo.save(profilesToCreate);
    await walletRepo.save(walletsToCreate);

    console.log(`Seeded ${userCount} employees for payroll test`);

    // 2. Run Payroll
    const payrollRes = await request(app.getHttpServer())
      .post('/api/v1/hr/payroll/run')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    // 3. Verify
    const data = payrollRes.body.data;
    // Should verify it processed at least the 110 users we created (plus any from seed)
    expect(data.totalEmployees).toBeGreaterThanOrEqual(userCount);

    // Call DB directly to check correct state
    const wallets = await walletRepo.find({ where: { tenantId } });
    const outstandingBalances = wallets.filter(
      (w) => Number(w.payableBalance) > 0,
    );
    expect(outstandingBalances.length).toBe(0);

    console.log(
      `Payroll processed ${data.totalEmployees} employees with total payout $${data.totalPayout}`,
    );
  }, 120000); // Long timeout for bulk ops
});
