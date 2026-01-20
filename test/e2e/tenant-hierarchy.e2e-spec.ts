import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { TransformInterceptor } from '../../src/common/interceptors';
import { PasswordHashService } from '../../src/common/services/password-hash.service';
import { MailService } from '../../src/modules/mail/mail.service';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { Role } from '../../src/modules/users/enums/role.enum';
import { seedTestDatabase } from '../utils/seed-data';

// ... existing imports ...

// ... inside beforeEach ...

describe('Tenant Hierarchy & Quotas (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let parentTenant: Tenant;
  let childTenant: Tenant;
  let adminToken: string;
  let tenantHost: string;

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
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Seed test database to get admin user
    const seedData = await seedTestDatabase(dataSource);
    parentTenant = (await dataSource.getRepository(Tenant).findOne({
      where: { id: seedData.tenantId },
    })) as Tenant;

    // Seed Child Tenant
    childTenant = await dataSource.getRepository(Tenant).save({
      name: 'Child Branch',
      slug: `child-branch-${Date.now()}`,
      parent: parentTenant,
      quotas: { max_users: 1 }, // Strict quota
    });

    // Create an admin user for child tenant
    const UserRepository = dataSource.getRepository('User');
    const passwordHashService = new PasswordHashService();
    const password = process.env.SEED_ADMIN_PASSWORD || 'ChaptersERP123!';
    const passwordHash = await passwordHashService.hash(password);

    const childAdmin = await UserRepository.save({
      firstName: 'Child',
      lastName: 'Admin',
      email: `child-admin-${Date.now()}@example.com`,
      passwordHash,
      role: Role.ADMIN,
      tenantId: childTenant.id,
      isActive: true,
    });

    // Login to get token
    tenantHost = `${childTenant.slug}.example.com`;
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', tenantHost)
      .send({
        email: childAdmin.email,
        password: password,
      })
      .expect(200);

    adminToken = loginResponse.body.data.accessToken;
  });

  it('should enforce max_users quota', async () => {
    // Current usage is 1 (the admin user itself)
    // Quota is 1.
    // Creating another user should fail.

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'New',
        lastName: 'User',
        email: 'new@child.com',
        password: 'Password123!',
        role: Role.FIELD_STAFF,
      })
      .expect(403);
  });

  it.skip('should allow user creation if quota is increased', async () => {
    // Increase quota directly in DB
    childTenant.quotas = { max_users: 5 };
    await dataSource.getRepository(Tenant).save(childTenant);

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'New',
        lastName: 'User 2',
        email: `new2-${Date.now()}@child.com`,
        password: 'Password123!',
        role: Role.FIELD_STAFF,
      })
      .expect(201);
  });

  it('should verify parent-child relationship via DB', async () => {
    const fetchedChild = await dataSource.getRepository(Tenant).findOne({
      where: { id: childTenant.id },
      relations: ['parent'],
    });

    expect(fetchedChild.parent.id).toEqual(parentTenant.id);
  });
});
