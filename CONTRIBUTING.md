# Contributing to Chapters Studio ERP

Guidelines for contributing to this codebase.

## Project Structure

```text
src/
├── common/          # Shared kernels (Guards, Interceptors, Decorators, Repositories)
├── database/        # Migrations, Seeds, Data Source Config
├── modules/         # Feature Modules
│   └── [feature]/
│       ├── dto/           # Data Transfer Objects (Validation)
│       ├── entities/      # TypeORM Entities
│       ├── controllers/   # HTTP Endpoints
│       ├── services/      # Business Logic
│       └── [feature].module.ts
└── main.ts
```

## Code Standards

### Naming Conventions
- **Classes**: `PascalCase` (e.g., `BookingsService`)
- **Files**: `kebab-case` (e.g., `bookings.service.ts`)
- **DI Tokens**: `UPPER_SNAKE_CASE` (e.g., `TENANT_REPO_CLIENT`)

### TypeScript
- No `any` in production code (tests excepted per eslint config)
- Use proper generic types for repositories and services
- Follow strict null checks

---

## Testing

### Test Organization

```text
src/modules/[feature]/services/[name].service.spec.ts  # Unit tests (colocated)
test/[feature].e2e-spec.ts                             # E2E tests
test/integration/                                       # Integration tests
test/helpers/                                           # Shared test utilities
```

### Using Mock Factories

Import centralized mocks from `test/helpers/mock-factories.ts`:

```typescript
import {
  createMockRepository,
  createMockMetricsFactory,
  createMockConfigService,
  mockTenantContext,
} from '../../../test/helpers/mock-factories';

describe('MyService', () => {
  const mockRepository = createMockRepository<MyEntity>();
  const mockMetricsFactory = createMockMetricsFactory();

  beforeEach(() => {
    mockTenantContext('tenant-123');
    // Reset mocks between tests
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
```

### Available Mock Factories

| Factory                          | Description                               |
|----------------------------------|-------------------------------------------|
| `createMockRepository<T>()`      | TypeORM repository with common methods    |
| `createMockTenantAwareRepository<T>()` | Tenant-scoped repository               |
| `createMockMetricsFactory()`     | prom-client MetricsFactory                |
| `createMockConfigService(overrides)` | NestJS ConfigService                  |
| `createMockJwtService()`         | NestJS JwtService                         |
| `createMockCacheManager()`       | Cache manager                             |
| `createMockMailService()`        | MailService with queue and send methods   |
| `createMockEventEmitter()`       | NestJS EventEmitter2                      |
| `createMockLogger()`             | Silent Logger                             |
| `createMockMinioClient()`        | S3-compatible MinIO client                |
| `mockTenantContext(tenantId)`    | Sets up TenantContextService mocks        |

### Test Commands

```bash
# Run all unit tests
npm run test

# Run specific test file
npm run test -- --testPathPatterns="bookings.service"

# Run E2E tests
npm run test:e2e

# Run with coverage
npm run test:cov
```

### Best Practices

1. **Isolate tests** - Each test should be independent
2. **Clear mocks** - Use `jest.clearAllMocks()` in `beforeEach`
3. **Restore spies** - Use `jest.restoreAllMocks()` in `afterEach`
4. **Use centralized mocks** - Don't duplicate mock implementations
5. **Test tenant isolation** - Always mock tenant context for tenant-aware services

---

## Commit Guidelines

- Use conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`
- Keep commits focused and atomic

---

## Pull Request Process

1. Create feature branch from `main`
2. Ensure all tests pass: `npm run test && npm run test:e2e`
3. Ensure lint passes: `npm run lint`
4. Update documentation if needed
5. Request review
