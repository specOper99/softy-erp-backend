import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors';
import { MailService } from '../src/modules/mail/mail.service';

// Mock ThrottlerGuard to always allow requests in tests
class MockThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe('Multi-Tenancy Isolation E2E Tests', () => {
  let app: INestApplication;

  // Tenant A
  const timestamp = Date.now();
  const tenantA_Company = `Tenant A Corp ${timestamp}`;
  const tenantA_Email = `tenantA-${timestamp}@example.com`;
  const tenantA_Password = 'TestPassword123!';
  let tenantA_Token: string;
  let tenantA_Id: string; // Declared

  // Tenant B
  const tenantB_Company = `Tenant B Inc ${timestamp}`;
  const tenantB_Email = `tenantB-${timestamp}@example.com`;
  const tenantB_Password = 'TestPassword123!';
  let tenantB_Token: string;
  let tenantB_Id: string; // Declared

  beforeAll(async () => {
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
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should register Tenant A and User A', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: tenantA_Email,
        password: tenantA_Password,
        companyName: tenantA_Company,
      });

    if (response.status !== 201) {
      console.error(
        'Register Tenant A Failed:',
        JSON.stringify(response.body, null, 2),
      );
    }
    expect(response.status).toBe(201);

    expect(response.body.data).toHaveProperty('accessToken');
    expect(response.body.data.user).toHaveProperty('tenantId');
    tenantA_Token = response.body.data.accessToken;
    tenantA_Id = response.body.data.user.tenantId;
  });

  it('should register Tenant B and User B', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: tenantB_Email,
        password: tenantB_Password,
        companyName: tenantB_Company,
      })
      .expect(201);

    expect(response.body.data).toHaveProperty('accessToken');
    expect(response.body.data.user).toHaveProperty('tenantId');
    tenantB_Token = response.body.data.accessToken;
    tenantB_Id = response.body.data.user.tenantId;
  });

  it('should verify Tenant A cannot see Tenant B data', async () => {
    // 1. Create Package in Tenant A
    const pkgA = await request(app.getHttpServer())
      .post('/api/v1/packages')
      .set('Authorization', `Bearer ${tenantA_Token}`)
      .set('X-Tenant-ID', tenantA_Id)
      .send({
        name: 'Package A Exclusive',
        price: 1000,
        description: 'Exclusive to Tenant A',
      })
      .expect(201);

    const pkgA_Id = pkgA.body.data.id;

    // 2. Create Package in Tenant B
    const pkgB = await request(app.getHttpServer())
      .post('/api/v1/packages')
      .set('Authorization', `Bearer ${tenantB_Token}`)
      .set('X-Tenant-ID', tenantB_Id)
      .send({
        name: 'Package B Exclusive',
        price: 2000,
        description: 'Exclusive to Tenant B',
      })
      .expect(201);

    const pkgB_Id = pkgB.body.data.id;

    // 3. User A should try to fetch Package B (should fail 404)
    await request(app.getHttpServer())
      .get(`/api/v1/packages/${pkgB_Id}`)
      .set('Authorization', `Bearer ${tenantA_Token}`)
      .set('X-Tenant-ID', tenantA_Id)
      .expect(404);

    // 4. User B should try to fetch Package A (should fail 404)
    await request(app.getHttpServer())
      .get(`/api/v1/packages/${pkgA_Id}`)
      .set('Authorization', `Bearer ${tenantB_Token}`)
      .set('X-Tenant-ID', tenantB_Id)
      .expect(404);

    // 5. User A lists packages, should only see Package A
    const listA = await request(app.getHttpServer())
      .get('/api/v1/packages')
      .set('Authorization', `Bearer ${tenantA_Token}`)
      .set('X-Tenant-ID', tenantA_Id)
      .expect(200);

    const idsA = listA.body.data.map((p: any) => p.id);
    expect(idsA).toContain(pkgA_Id);
    expect(idsA).not.toContain(pkgB_Id);

    // 6. User B lists packages, should only see Package B
    const listB = await request(app.getHttpServer())
      .get('/api/v1/packages')
      .set('Authorization', `Bearer ${tenantB_Token}`)
      .set('X-Tenant-ID', tenantB_Id)
      .expect(200);

    const idsB = listB.body.data.map((p: any) => p.id);
    expect(idsB).toContain(pkgB_Id);
    expect(idsB).not.toContain(pkgA_Id);
  });
});
