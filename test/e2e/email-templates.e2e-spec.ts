import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { TransformInterceptor } from '../../src/common/interceptors';
import { MailService } from '../../src/modules/mail/mail.service';
import { seedTestDatabase } from '../utils/seed-data';

describe('Email Templates (E2E)', () => {
  let app: INestApplication;
  let adminToken: string;
  let _tenantId: string;

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

    // Seed test database to get admin user
    const dataSource = app.get(DataSource);
    const seedData = await seedTestDatabase(dataSource);
    const email = seedData.admin.email;
    const password = process.env.SEED_ADMIN_PASSWORD || 'softYERP123!';
    const tenantHost = `${seedData.tenantId}.example.com`;

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', tenantHost)
      .send({ email, password });

    if (loginResponse.status !== 200) {
      console.error('Login failed. Status:', loginResponse.status);
      console.error('Response Body:', JSON.stringify(loginResponse.body, null, 2));
      throw new Error('Failed to login as admin for E2E tests');
    }

    adminToken = loginResponse.body.data.accessToken;
    _tenantId = seedData.tenantId;
  });

  afterAll(async () => {
    await app.close();
  });

  const templateDto = {
    name: 'test-template',
    subject: 'Test Subject {{name}}',
    content: '<h1>Hello {{name}}</h1>',
    variables: ['name'],
  };

  let templateId: string;

  it('/email-templates (POST) - Create Template', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/email-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(templateDto)
      .expect(201);

    expect(response.body.data.id).toBeDefined();
    expect(response.body.data.name).toBe(templateDto.name);
    templateId = response.body.data.id;
  });

  it('/email-templates (GET) - List Templates', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/email-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
    const found = response.body.data.find((t: any) => t.id === templateId);
    expect(found).toBeDefined();
  });

  it('/email-templates/:id (GET) - Get Template', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/email-templates/${templateId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.data.id).toBe(templateId);
  });

  it('/email-templates/preview (POST) - Preview Template', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/email-templates/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        content: templateDto.content,
        data: { name: 'World' },
      })
      .expect(201);

    expect(response.body.data.html).toContain('Hello World');
  });

  it('/email-templates/:id (PUT) - Update Template', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/email-templates/${templateId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ subject: 'Updated Subject' })
      .expect(200);

    expect(response.body.data.subject).toBe('Updated Subject');
  });

  it('/email-templates/:id (DELETE) - Delete Template', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/email-templates/${templateId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/email-templates/${templateId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
