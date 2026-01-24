import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors';
import { MailService } from '../src/modules/mail/mail.service';
import { seedTestDatabase } from './utils/seed-data';

class MockThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe('Media Module E2E Tests', () => {
  let app: INestApplication;
  let accessToken: string;
  let createdAttachmentId: string;

  beforeAll(async () => {
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    if (!adminPassword) {
      throw new Error('Missing required environment variable: SEED_ADMIN_PASSWORD');
    }

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
        queueEmailVerification: jest.fn().mockResolvedValue(undefined),
        queuePasswordReset: jest.fn().mockResolvedValue(undefined),
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

    const dataSource = app.get(DataSource);
    const seedData = await seedTestDatabase(dataSource);
    const tenantHost = `${seedData.tenantId}.example.com`;

    // Login as admin
    const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Host', tenantHost).send({
      email: seedData.admin.email,
      password: adminPassword,
    });

    accessToken = loginResponse.body.data?.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Attachments', () => {
    describe('POST /api/v1/media', () => {
      it('should create an attachment record', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/media')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'test-document.pdf',
            mimeType: 'application/pdf',
            url: 'https://example.com/test-document.pdf',
            size: 1024,
          });

        if (response.status !== 201) {
          console.log('Attachment Creation Failed Debug:', response.body);
        }

        expect(response.status).toBe(201);

        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.name).toBe('test-document.pdf');
        createdAttachmentId = response.body.data.id;
      });

      it('should fail without authentication', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/media')
          .send({
            filename: 'unauthorized.pdf',
            mimeType: 'application/pdf',
          })
          .expect(401);
      });
    });

    describe('GET /api/v1/media', () => {
      it('should return all attachments', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/media')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data).toBeInstanceOf(Array);
      });
    });

    describe('GET /api/v1/media/:id', () => {
      it('should return a specific attachment', async () => {
        if (!createdAttachmentId) return;

        const response = await request(app.getHttpServer())
          .get(`/api/v1/media/${createdAttachmentId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data.id).toBe(createdAttachmentId);
      });

      it('should return 404 for non-existent attachment', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/media/00000000-0000-0000-0000-000000000000')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);
      });
    });

    describe('POST /api/v1/media/presigned-upload', () => {
      it('should get presigned upload URL', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/media/presigned-upload')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            filename: 'upload-test.jpg',
            mimeType: 'image/jpeg',
          })
          .expect(201);

        expect(response.body.data).toHaveProperty('uploadUrl');
        expect(response.body.data).toHaveProperty('attachment');
      });
    });

    describe('DELETE /api/v1/media/:id', () => {
      it('should delete an attachment', async () => {
        if (!createdAttachmentId) return;

        await request(app.getHttpServer())
          .delete(`/api/v1/media/${createdAttachmentId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
      });
    });
  });
});
