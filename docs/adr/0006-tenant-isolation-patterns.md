# ADR-0006: Tenant Isolation Patterns

**Status:** Accepted  
**Date:** 2026-02-01  
**Authors:** Architecture Team  

## Context

Softy ERP is a multi-tenant SaaS application where data isolation between tenants is a critical security requirement. A consistency audit revealed several patterns of tenant isolation bypass:

1. Direct use of `dataSource.getRepository()` bypassing `TenantAwareRepository`
2. Query builders without tenant scoping
3. Background jobs processing data across tenants without proper context isolation
4. Stream/export endpoints without tenant filtering
5. Controllers directly injecting repositories instead of using services

These patterns create risk of cross-tenant data leakage—a critical security vulnerability.

## Decision

We adopt the following mandatory patterns for tenant isolation:

### 1. Repository Layer

**All tenant-scoped entities MUST use `TenantAwareRepository<T>`:**

```typescript
// ✅ CORRECT: Custom repository extending TenantAwareRepository
@Injectable()
export class BookingRepository extends TenantAwareRepository<Booking> {
  constructor(
    @InjectRepository(Booking)
    repository: Repository<Booking>,
  ) {
    super(repository);
  }
}

// ❌ WRONG: Direct repository injection in services
@Injectable()
export class MyService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>, // FORBIDDEN
  ) {}
}
```

**Exceptions:**
- Platform-scoped entities (e.g., `Tenant`, `PlatformUser`) that are intentionally tenant-agnostic
- User preferences scoped by `userId` rather than `tenantId`

### 2. Query Builders

**Always use the repository's query builder methods:**

```typescript
// ✅ CORRECT: Using TenantAwareRepository.createQueryBuilder
const results = await this.bookingRepository
  .createQueryBuilder('b')  // Auto-scoped to tenant
  .where('b.status = :status', { status })
  .getMany();

// ✅ CORRECT: Using createStreamQueryBuilder for exports
const stream = await this.transactionRepository
  .createStreamQueryBuilder('t')
  .orderBy('t.createdAt', 'DESC')
  .stream();

// ❌ WRONG: Direct dataSource query builder
const results = await this.dataSource
  .getRepository(Booking)
  .createQueryBuilder('b')  // NO TENANT SCOPING!
  .getMany();
```

### 3. Background Jobs / Cron

**All tenant-processing jobs MUST iterate with tenant context:**

```typescript
// ✅ CORRECT: Tenant-isolated background job
@Cron(CronExpression.EVERY_HOUR)
async processAllTenants(): Promise<void> {
  await this.distributedLockService.withLock('job:name', async () => {
    const tenants = await this.tenantsService.findAll();
    
    for (const tenant of tenants) {
      await TenantContextService.run(tenant.id, async () => {
        // All operations here are tenant-scoped
        await this.processForTenant();
      });
    }
  });
}

// ❌ WRONG: Querying all data without tenant context
@Cron(CronExpression.EVERY_HOUR)
async processAll(): Promise<void> {
  const allBookings = await this.bookingRepository.find(); // BAD!
}
```

### 4. Controllers

**Controllers MUST NOT inject repositories directly:**

```typescript
// ✅ CORRECT: Controller uses service
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}
  
  @Get()
  findAll() {
    return this.bookingsService.findAll();
  }
}

// ❌ WRONG: Controller injects repository
@Controller('bookings')
export class BookingsController {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>, // FORBIDDEN
  ) {}
}
```

### 5. Exception Handling

**Use `TenantMismatchException` for all tenant validation failures:**

```typescript
import { TenantMismatchException, TenantMismatchOperation } from '@common/exceptions';

// When detecting cross-tenant access
throw new TenantMismatchException({
  contextTenantId: currentTenantId,
  entityTenantId: entity.tenantId,
  operation: TenantMismatchOperation.UPDATE,
  entityType: 'Booking',
  entityId: entity.id,
});
```

### 6. Logging

**Use `TenantAwareLogger` for automatic tenant context in logs:**

```typescript
import { TenantAwareLogger } from '@common/logger/tenant-aware.logger';

@Injectable()
export class MyService {
  private readonly logger = new TenantAwareLogger('MyService');
  
  doSomething() {
    this.logger.log('Operation completed', { bookingId: '123' });
    // Output: [MyService] Operation completed {"tenantId":"t-1","bookingId":"123"}
  }
}
```

## Consequences

### Positive
- Guaranteed tenant isolation at the repository layer
- Cross-tenant access attempts throw clear exceptions with audit trail
- ESLint rules catch violations at build time
- Background jobs are provably tenant-isolated
- Consistent logging enables security monitoring

### Negative
- Slightly more boilerplate (custom repository classes)
- Existing code needs refactoring to comply
- Platform-scoped services need explicit documentation of their exemption

### Neutral
- Developers must understand tenant context propagation via AsyncLocalStorage
- New entities require creating corresponding repository classes

## Compliance Verification

1. **Static Analysis:** ESLint rule `no-unsafe-tenant-context` flags:
   - `dataSource.getRepository()` calls outside platform modules
   - `@InjectRepository` decorators in controllers
   - Tenant ID fallback patterns

2. **Integration Tests:** Cross-tenant access tests in `tenant-isolation.e2e-spec.ts` verify:
   - Tenant A cannot read Tenant B's data
   - Tenant A cannot update Tenant B's data
   - Export streams only return current tenant's data

3. **Code Review Checklist:**
   - [ ] New entities extend `BaseTenantEntity`
   - [ ] New repositories extend `TenantAwareRepository`
   - [ ] Background jobs use `TenantContextService.run()`
   - [ ] Controllers use services, not repositories

## Related ADRs

- ADR-0002: Transactional Outbox (events after commit)
- ADR-0005: Service Extraction Pattern

## References

- [OWASP Multi-Tenancy Security](https://owasp.org/www-community/Multi-Tenant_Security)
- [AsyncLocalStorage Node.js Docs](https://nodejs.org/api/async_context.html)
