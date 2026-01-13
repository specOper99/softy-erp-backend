import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { User } from '../../src/modules/users/entities/user.entity';
import { Role } from '../../src/modules/users/enums/role.enum';

describe('Email Templates (E2E)', () => {
  let app: INestApplication;
  let adminToken: string;
  let _tenantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Login as Admin
    // Fetch seeded admin user (email is dynamic with random suffix)
    const dataSource = app.get(DataSource);
    const userRepo = dataSource.getRepository(User);
    const adminUser = await userRepo.findOne({ where: { role: Role.ADMIN } });

    if (!adminUser) {
      throw new Error('No admin user found in seed data');
    }

    const email = adminUser.email;
    const password = process.env.SEED_ADMIN_PASSWORD || 'ChaptersERP123!';

    const loginResponse = await request(app.getHttpServer()).post('/auth/login').send({ email, password });

    if (loginResponse.status !== 201 && loginResponse.status !== 200) {
      console.error('Login failed. Status:', loginResponse.status);
      console.error('Response Body:', JSON.stringify(loginResponse.body, null, 2));
      throw new Error('Failed to login as admin for E2E tests');
    }

    adminToken = loginResponse.body.accessToken;
    _tenantId = loginResponse.body.user.tenantId;
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
      .post('/email-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(templateDto)
      .expect(201);

    expect(response.body.id).toBeDefined();
    expect(response.body.name).toBe(templateDto.name);
    templateId = response.body.id;
  });

  it('/email-templates (GET) - List Templates', async () => {
    const response = await request(app.getHttpServer())
      .get('/email-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    const found = response.body.find((t: any) => t.id === templateId);
    expect(found).toBeDefined();
  });

  it('/email-templates/:id (GET) - Get Template', async () => {
    const response = await request(app.getHttpServer())
      .get(`/email-templates/${templateId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.id).toBe(templateId);
  });

  it('/email-templates/preview (POST) - Preview Template', async () => {
    const response = await request(app.getHttpServer())
      .post('/email-templates/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        content: templateDto.content,
        data: { name: 'World' },
      })
      .expect(201);

    expect(response.body.html).toContain('Hello World');
  });

  it('/email-templates/:id (PUT) - Update Template', async () => {
    const response = await request(app.getHttpServer())
      .put(`/email-templates/${templateId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ subject: 'Updated Subject' })
      .expect(200);

    expect(response.body.subject).toBe('Updated Subject');
  });

  it('/email-templates/:id (DELETE) - Delete Template', async () => {
    await request(app.getHttpServer())
      .delete(`/email-templates/${templateId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/email-templates/${templateId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
