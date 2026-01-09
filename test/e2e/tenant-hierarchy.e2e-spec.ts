import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import { Role } from '../../src/modules/users/enums/role.enum';

// ... existing imports ...

// ... inside beforeEach ...

describe('Tenant Hierarchy & Quotas (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let parentTenant: Tenant;
  let childTenant: Tenant;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    if (process.env.E2E_DB_RESET === 'true') {
      const entities = dataSource.entityMetadatas;
      for (const entity of entities) {
        const repository = dataSource.getRepository(entity.name);
        try {
          await repository.query(
            `TRUNCATE TABLE "${entity.tableName}" RESTART IDENTITY CASCADE;`,
          );
        } catch (error) {
          if (error.code !== '42P01') {
            // Ignore table not found
            throw error;
          }
        }
      }
    }

    // Seed Parent Tenant
    parentTenant = await dataSource.getRepository(Tenant).save({
      name: 'Parent Corp',
      slug: 'parent-corp',
      quotas: { max_users: 10 },
    });

    // Seed Child Tenant
    childTenant = await dataSource.getRepository(Tenant).save({
      name: 'Child Branch',
      slug: 'child-branch',
      parent: parentTenant,
      quotas: { max_users: 1 }, // Strict quota
    });

    // Seed Admin User for Child Tenant
    const password = process.env.SEED_ADMIN_PASSWORD || 'Password123!';
    const passwordHash = await bcrypt.hash(password, 10);

    const _adminUser = await dataSource.getRepository(User).save({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@child.com',
      passwordHash,
      role: Role.ADMIN,
      tenantId: childTenant.id,
      isActive: true,
    });

    // Login to get token
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@child.com',
        password: process.env.SEED_ADMIN_PASSWORD || 'Password123!',
      })
      .expect(200);

    adminToken = loginResponse.body.accessToken;
  });

  it('should enforce max_users quota', async () => {
    // Current usage is 1 (the admin user itself)
    // Quota is 1.
    // Creating another user should fail.

    await request(app.getHttpServer())
      .post('/users')
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

  it('should allow user creation if quota is increased', async () => {
    // Increase quota directly in DB
    childTenant.quotas = { max_users: 5 };
    await dataSource.getRepository(Tenant).save(childTenant);

    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'New',
        lastName: 'User 2',
        email: 'new2@child.com',
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
