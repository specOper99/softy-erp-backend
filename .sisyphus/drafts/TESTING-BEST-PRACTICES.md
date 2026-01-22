# Testing Best Practices Guide

## Overview

This document provides comprehensive testing guidelines for the Chapters Studio ERP system. It covers unit testing, integration testing, E2E testing, and test automation strategies.

---

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Test Pyramid](#test-pyramid)
3. [Unit Testing](#unit-testing)
4. [Integration Testing](#integration-testing)
5. [E2E Testing](#e2e-testing)
6. [Test Data Management](#test-data-management)
7. [Mocking Strategies](#mocking-strategies)
8. [Coverage Requirements](#coverage-requirements)
9. [CI/CD Integration](#cicd-integration)

---

## Testing Philosophy

### Core Principles

1. **Tests as Documentation** - Well-written tests serve as executable documentation
2. **Behavior-Driven Testing** - Test behavior, not implementation details
3. **Fast Feedback** - Unit tests should run in milliseconds
4. **Isolation** - Each test should be independent and repeatable
5. **Determinism** - Tests should produce consistent results

### Test Quality Metrics

| Metric             | Target  | Description                    |
| ------------------ | ------- | ------------------------------ |
| **Pass Rate**      | > 99%   | Stable, reliable test suite    |
| **Flakiness**      | < 1%    | Tests that fail intermittently |
| **Execution Time** | < 5 min | Full suite should be fast      |
| **Coverage**       | > 70%   | Code coverage percentage       |
| **Mutation Score** | > 50%   | Effectiveness of tests         |

---

## Test Pyramid

```
                    /\
                   /  \
                  / E2E \
                 /--------\
                /Integration\
               /--------------\
              /   Unit Tests   \
             /------------------\
            /--------------------\
           /      Repositories     \
          /------------------------\
```

| Layer           | Count   | Speed    | Scope             | Tools                |
| --------------- | ------- | -------- | ----------------- | -------------------- |
| **E2E**         | 10-20   | 5-10 min | Full system       | Supertest, Jest      |
| **Integration** | 50-100  | 1-2 min  | Module boundaries | Jest, Testcontainers |
| **Unit**        | 200-500 | < 1 min  | Single service    | Jest, NestJS Testing |

---

## Unit Testing

### Service Testing

```typescript
// src/modules/auth/auth.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Role } from '../users/enums/role.enum';

describe('AuthService', () => {
  let service: AuthService;
  let usersRepository: jest.Mocked<Repository<User>>;
  let refreshTokenRepository: jest.Mocked<Repository<RefreshToken>>;
  let jwtService: jest.Mocked<JwtService>;
  let dataSource: jest.Mocked<DataSource>;

  const mockUser: User = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'test@example.com',
    passwordHash: 'hashed_password',
    role: Role.OPS_MANAGER,
    tenantId: '550e8400-e29b-41d4-a716-446655440001',
    isActive: true,
    isMfaEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockUsersRepository = {
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    const mockRefreshTokenRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const mockJwtService = {
      sign: jest.fn().mockReturnValue('mock_access_token'),
    };

    const mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue({
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          findOne: jest.fn(),
          create: jest.fn(),
          save: jest.fn(),
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUsersRepository },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepository,
        },
        { provide: JwtService, useValue: mockJwtService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersRepository = module.get(getRepositoryToken(User));
    refreshTokenRepository = module.get(getRepositoryToken(RefreshToken));
    jwtService = module.get(JwtService);
    dataSource = module.get(DataSource);
  });

  describe('login', () => {
    it('should return auth response on successful login', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'SecureP@ss123',
      };

      usersRepository.findOne.mockResolvedValue(mockUser);
      jest.spyOn(service, 'validatePassword').mockResolvedValue(true);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(mockUser.email);
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'wrong_password',
      };

      usersRepository.findOne.mockResolvedValue(mockUser);
      jest.spyOn(service, 'validatePassword').mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'SecureP@ss123',
      };

      const inactiveUser = { ...mockUser, isActive: false };
      usersRepository.findOne.mockResolvedValue(inactiveUser);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should require MFA code when MFA is enabled', async () => {
      const mfaUser = { ...mockUser, isMfaEnabled: true };
      const loginDto = {
        email: 'test@example.com',
        password: 'SecureP@ss123',
      };

      usersRepository.findOne.mockResolvedValue(mfaUser);
      jest.spyOn(service, 'validatePassword').mockResolvedValue(true);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('requiresMfa', true);
      expect(result).not.toHaveProperty('accessToken');
    });
  });

  describe('refreshTokens', () => {
    it('should refresh tokens successfully', async () => {
      const mockRefreshToken: RefreshToken = {
        id: 'refresh-token-id',
        tokenHash: 'hashed_token',
        userId: mockUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isRevoked: false,
        lastUsedAt: null,
        userAgent: null,
        ipAddress: null,
        createdAt: new Date(),
      };

      refreshTokenRepository.findOne.mockResolvedValue(mockRefreshToken);
      refreshTokenRepository.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.refreshTokens('valid_refresh_token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should throw for expired token', async () => {
      const expiredToken: RefreshToken = {
        id: 'expired-token-id',
        tokenHash: 'hashed_token',
        userId: mockUser.id,
        expiresAt: new Date(Date.now() - 1000), // Already expired
        isRevoked: false,
        lastUsedAt: null,
        userAgent: null,
        ipAddress: null,
        createdAt: new Date(),
      };

      refreshTokenRepository.findOne.mockResolvedValue(expiredToken);

      await expect(
        service.refreshTokens('expired_refresh_token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
```

### Controller Testing

```typescript
// src/modules/auth/auth.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const mockAuthService = {
      login: jest.fn(),
      register: jest.fn(),
      refreshTokens: jest.fn(),
      logout: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  describe('login', () => {
    it('should return auth response', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'SecureP@ss123',
      };

      const mockResponse = {
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        expiresIn: 900,
        user: {
          id: '1',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 't1',
        },
      };

      authService.login.mockResolvedValue(mockResponse);

      const result = await controller.login(loginDto);

      expect(result).toEqual(mockResponse);
      expect(authService.login).toHaveBeenCalledWith(loginDto, undefined);
    });
  });
});
```

---

## Integration Testing

### Database Integration Tests

```typescript
// test/integration/transactions.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { TransactionType } from '../../src/modules/finance/enums/transaction-type.enum';
import { Currency } from '../../src/modules/finance/enums/currency.enum';

describe('Transactions Integration', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    // Clean up test data
    await dataSource.query(
      'DELETE FROM transactions WHERE tenant_id LIKE test-%',
    );
    await app.close();
  });

  describe('createTransaction', () => {
    it('should create a transaction with valid data', async () => {
      const createDto = {
        type: TransactionType.INCOME,
        amount: 1500.0,
        currency: Currency.USD,
        category: 'Service Revenue',
        transactionDate: new Date().toISOString(),
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/finance/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createDto)
        .expect(201);

      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.amount).toBe(1500);
      expect(response.body.data.type).toBe(TransactionType.INCOME);
    });

    it('should reject transaction with invalid amount', async () => {
      const createDto = {
        type: TransactionType.INCOME,
        amount: -100, // Invalid negative amount
        currency: Currency.USD,
        transactionDate: new Date().toISOString(),
      };

      await request(app.getHttpServer())
        .post('/api/v1/finance/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createDto)
        .expect(400);
    });
  });
});
```

### Multi-Tenant Isolation Tests

```typescript
// test/integration/tenant-isolation.e2e-spec.ts
describe('Multi-Tenant Isolation', () => {
  it('should not allow access to other tenant data', async () => {
    // Create resource as Tenant A
    const tenantAResource = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .send({
        /* booking data */
      })
      .expect(201);

    // Try to access as Tenant B
    await request(app.getHttpServer())
      .get(`/api/v1/bookings/${tenantAResource.body.data.id}`)
      .set('Authorization', `Bearer ${tenantBToken}`)
      .expect(404); // Should return 404, not 403 (no indication of existence)
  });
});
```

---

## E2E Testing

### Critical Path Testing

```typescript
// test/e2e/booking-workflow.e2e-spec.ts
describe('Booking Workflow E2E', () => {
  it('should complete full booking lifecycle', async () => {
    // 1. Login as operations manager
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'ops@example.com', password: 'SecureP@ss123' })
      .expect(200);

    const token = loginResponse.body.data.accessToken;

    // 2. Create a new booking
    const bookingResponse = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientName: 'John Doe',
        clientEmail: 'john@example.com',
        eventType: 'Wedding',
        eventDate: '2026-06-15T10:00:00Z',
        packageId: 'package-uuid',
      })
      .expect(201);

    const bookingId = bookingResponse.body.data.id;

    // 3. Assign a task to field staff
    await request(app.getHttpServer())
      .post(`/api/v1/bookings/${bookingId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Photography Session',
        assigneeId: 'staff-uuid',
        dueDate: '2026-06-14T18:00:00Z',
      })
      .expect(201);

    // 4. Complete the task
    await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskId}/complete`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        notes: 'Completed successfully',
        photos: ['photo1.jpg', 'photo2.jpg'],
      })
      .expect(200);

    // 5. Verify booking status
    const finalBooking = await request(app.getHttpServer())
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(finalBooking.body.data.status).toBe('COMPLETED');
  });
});
```

---

## Test Data Management

### Test Fixtures

```typescript
// test/fixtures/test-data.factory.ts
export class TestDataFactory {
  static createUser(overrides: Partial<User> = {}): User {
    return {
      id: faker.string.uuid(),
      email: faker.internet.email(),
      passwordHash: bcrypt.hashSync('TestP@ss123', 10),
      role: Role.FIELD_STAFF,
      tenantId: 'test-tenant-id',
      isActive: true,
      isMfaEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createTransaction(overrides: Partial<Transaction> = {}): Transaction {
    return {
      id: faker.string.uuid(),
      type: TransactionType.INCOME,
      amount: faker.number.float({ min: 100, max: 10000, multipleOf: 0.01 }),
      currency: Currency.USD,
      exchangeRate: 1.0,
      tenantId: 'test-tenant-id',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createBooking(overrides: Partial<Booking> = {}): Booking {
    return {
      id: faker.string.uuid(),
      clientName: faker.person.fullName(),
      clientEmail: faker.internet.email(),
      eventType: 'Wedding',
      eventDate: faker.date.future(),
      status: BookingStatus.PENDING,
      tenantId: 'test-tenant-id',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }
}
```

### Database Seeding

```typescript
// test/fixtures/database.seeder.ts
export class DatabaseSeeder {
  constructor(private readonly dataSource: DataSource) {}

  async seedTenant(tenantData: Partial<Tenant>): Promise<Tenant> {
    const tenant = this.dataSource.manager.create(Tenant, tenantData);
    return this.dataSource.manager.save(tenant);
  }

  async seedUsers(tenantId: string, count: number): Promise<User[]> {
    const users: User[] = [];
    for (let i = 0; i < count; i++) {
      const user = TestDataFactory.createUser({ tenantId });
      users.push(await this.dataSource.manager.save(user));
    }
    return users;
  }

  async cleanup(): Promise<void> {
    await this.dataSource.query(
      'DELETE FROM transactions WHERE tenant_id LIKE test-%',
    );
    await this.dataSource.query(
      'DELETE FROM bookings WHERE tenant_id LIKE test-%',
    );
    await this.dataSource.query(
      'DELETE FROM users WHERE tenant_id LIKE test-%',
    );
    await this.dataSource.query('DELETE FROM tenants WHERE name LIKE test-%');
  }
}
```

---

## Mocking Strategies

### Service Layer Mocking

```typescript
// test/mocks/services/mock-cache.service.ts
export class MockCacheService {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async set(key: string, value: unknown, _ttl?: number): Promise<void> {
    this.store.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async reset(): Promise<void> {
    this.store.clear();
  }

  // Helper for testing
  mockGet(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  mockDel(key: string): void {
    this.store.delete(key);
  }
}
```

### External Service Mocking

```typescript
// test/mocks/external/minio.service.ts
export class MockMinioService {
  private uploadedFiles = new Map<string, Buffer>();

  async uploadFile(
    bucket: string,
    key: string,
    buffer: Buffer,
    _contentType: string,
  ): Promise<string> {
    this.uploadedFiles.set(key, buffer);
    return `https://minio.example.com/${bucket}/${key}`;
  }

  async getFile(key: string): Promise<Buffer | null> {
    return this.uploadedFiles.get(key) || null;
  }

  async deleteFile(key: string): Promise<void> {
    this.uploadedFiles.delete(key);
  }

  // Verification helpers
  async assertFileUploaded(key: string): Promise<void> {
    const exists = this.uploadedFiles.has(key);
    expect(exists).toBe(true);
  }

  async assertFileNotUploaded(key: string): Promise<void> {
    const exists = this.uploadedFiles.has(key);
    expect(exists).toBe(false);
  }
}
```

---

## Coverage Requirements

### Coverage Thresholds

| Type                   | Minimum | Target | Stretch |
| ---------------------- | ------- | ------ | ------- |
| **Line Coverage**      | 70%     | 80%    | 90%     |
| **Branch Coverage**    | 60%     | 70%    | 85%     |
| **Function Coverage**  | 70%     | 85%    | 95%     |
| **Statement Coverage** | 70%     | 80%    | 90%     |

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70,
    },
    './src/modules/auth/': {
      branches: 80,
      functions: 90,
      lines: 85,
      statements: 85,
    },
    './src/modules/finance/': {
      branches: 75,
      functions: 85,
      lines: 80,
      statements: 80,
    },
  },
};
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run test:unit -- --passWithNoTests
        env:
          NODE_ENV: test
          DB_HOST: localhost
          DB_PORT: 5432

      - run: npm run test:cov -- --outputDir ./coverage/unit
        env:
          NODE_ENV: test

      - uses: codecov/codecov-action@v3
        with:
          directory: ./coverage/unit
          flags: unit

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15-alpine
        ports: ['5432:5432']
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: --health-cmd "redis-cli ping" --health-interval 10s --health-timeout 5s --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run test:integration
        env:
          NODE_ENV: test
          DB_HOST: localhost
          DB_PORT: 5432
          REDIS_HOST: localhost
          REDIS_PORT: 6379

      - uses: codecov/codecov-action@v3
        with:
          directory: ./coverage/integration
          flags: integration

  e2e-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15-alpine
        ports: ['5432:5432']
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: --health-cmd "redis-cli ping" --health-interval 10s --health-timeout 5s --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run test:e2e
        env:
          NODE_ENV: test
          DB_HOST: localhost
          DB_PORT: 5432
          REDIS_HOST: localhost
          REDIS_PORT: 6379
```

---

## Best Practices

### DO's

✅ Use descriptive test names that explain what is being tested  
✅ Follow Arrange-Act-Assert pattern  
✅ Test behavior, not implementation  
✅ Use factories for test data  
✅ Keep tests fast and isolated  
✅ Mock external dependencies  
✅ Use test coverage as a guide, not a goal  
✅ Write tests before fixing bugs (regression tests)

### DON'Ts

❌ Don't write tests that depend on execution order  
❌ Don't use real external services in unit tests  
❌ Don't skip error case testing  
❌ Don't test the same thing multiple times  
❌ Don't leave commented-out tests  
❌ Don't use magic numbers without explanations  
❌ Don't make tests overly complex

---

## References

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/unit-testing)
- [Testing Trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
- [Mocking Best Practices](https://martinfowler.com/articles/mocksArentStubs.html)

---

_Document Version: 1.0.0_  
_Last Updated: January 8, 2026_  
_Next Review: April 8, 2026_
