# Architecture Decision Records (ADRs)

## Overview

This document contains Architecture Decision Records (ADRs) for the Chapters Studio ERP system. ADRs are used to capture important architectural decisions along with their context and consequences.

---

## ADR-001: Atomic Token Refresh with Pessimistic Locking

**Status:** Implemented  
**Date:** January 8, 2026  
**Author:** AI Code Review System

### Context

The original token refresh mechanism used optimistic locking with conditional updates, which was reactive rather than preventive. This created a race condition where two concurrent requests could both pass validation before either performed the update.

### Decision

Implement atomic token refresh using database transactions with pessimistic write locking (`SELECT ... FOR UPDATE`).

### Consequences

**Positive:**

- Prevents race conditions at the database level
- Only one concurrent request can succeed
- Provides stronger security guarantees
- Simpler reasoning about concurrency

**Negative:**

- Slightly higher database lock contention under high concurrency
- Requires transaction management
- May need connection pool tuning

### Implementation

```typescript
// src/modules/auth/auth.service.ts
async refreshTokens(
  refreshToken: string,
  context?: RequestContext,
): Promise<TokensDto> {
  const tokenHash = this.hashToken(refreshToken);

  return this.dataSource.transaction(async (manager) => {
    // Acquire row-level lock immediately
    const storedToken = await manager.findOne(RefreshToken, {
      where: { tokenHash },
      relations: ['user'],
      lock: { mode: 'pessimistic_write' },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!storedToken.isValid()) {
      if (storedToken.isRevoked) {
        this.logger.warn({ message: 'Possible token reuse detected' });
        await manager.update(
          RefreshToken,
          { userId: storedToken.userId, isRevoked: false },
          { isRevoked: true },
        );
      }
      throw new UnauthorizedException('Refresh token expired or revoked');
    }

    storedToken.isRevoked = true;
    storedToken.lastUsedAt = new Date();
    await manager.save(storedToken);

    return this.generateTokens(storedToken.user, context);
  });
}
```

---

## ADR-002: Database Synchronization Guard in Production

**Status:** Implemented  
**Date:** January 8, 2026  
**Author:** AI Code Review System

### Context

TypeORM's `synchronize` option can auto-create database schemas from entities. This is useful in development but dangerous in production where it could cause data loss or schema corruption.

### Decision

Implement a runtime guard that throws an error if synchronization is enabled in production environments.

### Consequences

**Positive:**

- Prevents accidental data loss in production
- Fails fast during deployment if misconfigured
- Clear error message for debugging

**Negative:**

- Deployment will fail if configuration is wrong
- Requires proper environment variable management

### Implementation

```typescript
// src/database/data-source.ts
synchronize: (() => {
  const syncEnabled = process.env.DB_SYNCHRONIZE === 'true';
  const nodeEnv = process.env.NODE_ENV || 'development';

  if (syncEnabled && nodeEnv === 'production') {
    throw new Error(
      'CRITICAL SECURITY VIOLATION: Database synchronization ' +
      '(DB_SYNCHRONIZE=true) is NOT allowed in production environments. ' +
      'Current configuration: DB_SYNCHRONIZE=true, NODE_ENV=production.',
    );
  }

  return nodeEnv === 'test';
})(),
```

### Related Files

- `src/database/data-source.ts`
- `docker-compose.yml` (environment configuration)

---

## ADR-003: Financial Amount Validation Strategy

**Status:** Implemented  
**Date:** January 8, 2026  
**Author:** AI Code Review System

### Context

Financial operations require precise input validation to prevent fraud, rounding errors, and data corruption. The original implementation only checked basic positivity and maximum value.

### Decision

Implement comprehensive financial amount validation with:

- Currency-specific decimal precision
- Finite number validation
- Rounding to prevent floating-point errors

### Consequences

**Positive:**

- Prevents invalid financial data
- Supports multiple currencies with different precision requirements
- Clear error messages for validation failures

**Negative:**

- Additional validation overhead on every transaction
- Requires understanding of currency-specific rules

### Implementation

```typescript
// src/modules/finance/services/finance.service.ts
private validateTransactionAmount(amount: number, currency?: string): void {
  if (!Number.isFinite(amount)) {
    throw new BadRequestException('finance.amount_must_be_valid_number');
  }

  if (amount <= 0) {
    throw new BadRequestException('finance.amount_must_be_positive');
  }

  const precision = currency === 'IQD' ? 0 : 2;
  const [integer, decimal] = amount.toString().split('.');
  if (decimal && decimal.length > precision) {
    throw new BadRequestException(
      `finance.amount_precision_error: Maximum ${precision} decimal places`,
    );
  }

  if (amount > 999999999.99) {
    throw new BadRequestException('finance.amount_exceeds_maximum');
  }
}
```

### Currency Precision Rules

| Currency      | Code | Decimal Places |
| ------------- | ---- | -------------- |
| US Dollar     | USD  | 2              |
| Euro          | EUR  | 2              |
| British Pound | GBP  | 2              |
| Iraqi Dinar   | IQD  | 0              |
| Syrian Pound  | SYP  | 2              |

---

## ADR-004: Multi-Tenant Isolation Strategy

**Status:** Implemented  
**Date:** January 8, 2026  
**Author:** AI Code Review System

### Context

The system requires strong multi-tenant isolation to prevent data leakage between tenants. Multiple strategies were evaluated including:

- Row-level security (RLS)
- Separate databases per tenant
- Application-level filtering
- Composite foreign keys

### Decision

Implement a defense-in-depth strategy combining:

1. Application-level tenant context via `AsyncLocalStorage`
2. Database-level composite foreign key constraints
3. Query-level tenant filtering

### Consequences

**Positive:**

- Strong isolation at multiple levels
- Database enforces tenant boundaries even if application has bugs
- Efficient queries with proper indexing

**Negative:**

- Complex migration management
- Requires careful attention to foreign key constraints
- Higher storage overhead for composite keys

### Implementation

**Tenant Context Service:**

```typescript
// src/common/services/tenant-context.service.ts
export class TenantContextService {
  private static readonly storage = new AsyncLocalStorage<TenantContext>();

  static getTenantId(): string | undefined {
    return this.storage.getStore()?.tenantId;
  }

  static run<T>(tenantId: string, callback: () => T): T {
    const context: TenantContext = { tenantId };
    return this.storage.run(context, callback);
  }
}
```

**Composite Foreign Key:**

```sql
-- Database migration
ALTER TABLE users
ADD CONSTRAINT FK_users_tenant
FOREIGN KEY (id, tenant_id)
REFERENCES tenants(id, id)
ON DELETE CASCADE;
```

---

## ADR-005: Event-Driven Architecture with CQRS

**Status:** Implemented  
**Date:** January 8, 2026  
**Author:** AI Code Review System

### Context

The system requires asynchronous processing for:

- Email notifications
- Analytics tracking
- Webhook deliveries
- Report generation

### Decision

Implement event-driven architecture using:

- NestJS CQRS for command/event handling
- BullMQ for background job processing
- Redis as message broker

### Consequences

**Positive:**

- Decouples synchronous request processing from background work
- Improves response times for API calls
- Enables reliable retry mechanisms
- Supports distributed processing

**Negative:**

- Increased system complexity
- Eventual consistency introduces complexity
- Requires Redis infrastructure
- Debugging distributed systems is harder

### Implementation

**Command Handler:**

```typescript
@CommandHandler(CreateBookingCommand)
export class CreateBookingHandler implements ICommandHandler<CreateBookingCommand> {
  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(command: CreateBookingCommand): Promise<Booking> {
    const booking = await this.bookingRepository.create(command.dto);
    this.eventPublisher.publish(new BookingCreatedEvent(booking));
    return booking;
  }
}
```

**Event Handler:**

```typescript
@EventsHandler(BookingCreatedEvent)
export class BookingCreatedHandler implements IEventHandler<BookingCreatedEvent> {
  constructor(private readonly mailService: MailService) {}

  async handle(event: BookingCreatedEvent): Promise<void> {
    await this.mailService.sendBookingConfirmation(event.booking);
  }
}
```

---

## ADR-006: Rate Limiting Strategy

**Status:** Implemented  
**Date:** January 8, 2026  
**Author:** AI Code Review System

### Context

The system requires protection against:

- Brute force attacks on authentication endpoints
- Denial of service attacks
- API abuse

### Decision

Implement tiered rate limiting:

- Global rate limiting (60 requests/minute)
- Endpoint-specific rate limiting for sensitive operations
- IP-based blocking for repeated violations

### Consequences

**Positive:**

- Protects against various attack vectors
- Configurable per endpoint
- Graceful degradation under load

**Negative:**

- May block legitimate high-volume users
- Requires Redis for distributed state
- Configuration complexity

### Implementation

**Global Rate Limiting:**

```typescript
// src/app.module.ts
ThrottlerModule.forRoot([
  { name: 'short', ttl: 1000, limit: 3 },
  { name: 'medium', ttl: 10000, limit: 20 },
  { name: 'long', ttl: 60000, limit: 100 },
]),
```

**Endpoint-Specific Guard:**

```typescript
// src/modules/auth/guards/auth-rate-limit.guard.ts
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly limits = {
    login: { attempts: 5, windowMs: 900000 },
    forgotPassword: { attempts: 3, windowMs: 3600000 },
  };

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key = `auth_rate:${this.getEndpointType()}:${context.switchToHttp().getRequest().ip}`;
    // ... implementation
  }
}
```

---

## ADR-007: Error Handling Strategy

**Status:** Planned  
**Date:** TBD  
**Author:** TBD

### Context

The system needs consistent error handling across all endpoints with:

- Proper HTTP status codes
- Consistent error message format
- Security-aware error details (don't leak internal info in production)

### Decision

Implement unified exception filter with:

- Correlation ID tracking
- Structured error responses
- Different error detail levels for production vs development

### Implementation

```typescript
// src/common/filters/unified-exception.filter.ts
@Catch()
export class UnifiedExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const isProduction = process.env.NODE_ENV === 'production';
    // ... implementation
  }
}
```

---

## ADR-008: Testing Strategy

**Status:** Implemented  
**Date:** January 8, 2026  
**Author:** AI Code Review System

### Context

The system requires comprehensive test coverage across:

- Unit tests for business logic
- Integration tests for database operations
- E2E tests for critical user flows
- Contract tests for API boundaries

### Decision

Implement a testing pyramid:

1. **Unit Tests (70%)** - Fast, isolated tests for business logic
2. **Integration Tests (20%)** - Test database interactions
3. **E2E Tests (10%)** - Test critical user journeys

### Testing Technologies

| Layer       | Technology            | Purpose                  |
| ----------- | --------------------- | ------------------------ |
| Unit        | Jest + NestJS Testing | Business logic, services |
| Integration | Jest + Testcontainers | Database operations      |
| E2E         | Supertest             | API endpoints            |
| Contract    | Pact                  | Service interactions     |

### Test Coverage Requirements

| Module          | Minimum Coverage |
| --------------- | ---------------- |
| Auth Service    | 80%              |
| Finance Service | 75%              |
| User Service    | 80%              |
| All Services    | 70%              |

---

## ADR-009: Logging and Observability Strategy

**Status:** Implemented  
**Date:** January 8, 2026  
**Author:** AI Code Review System

### Context

The system requires comprehensive logging for:

- Debugging production issues
- Security audit trails
- Performance monitoring
- User activity tracking

### Decision

Implement structured logging with:

- JSON format for easy parsing
- Correlation IDs for request tracing
- Log levels (DEBUG, INFO, WARN, ERROR)
- Sensitive data masking (PII, passwords, tokens)

### Implementation

```typescript
// src/common/logger/logger.module.ts
const isProduction = configService.get('NODE_ENV') === 'production';

const transports = isProduction
  ? [new transports.Http()]
  : [new transports.Console()];

export const logger = createLogger({
  format: format.combine(
    format.timestamp(),
    format.json(),
    format.errors({ stack: true }),
  ),
  defaultMeta: { service: 'chapters-studio-erp' },
  transports,
});
```

### Log Entry Structure

```json
{
  "timestamp": "2026-01-08T11:14:41.000Z",
  "level": "info",
  "message": "User login successful",
  "service": "chapters-studio-erp",
  "correlationId": "corr_1702122881000_abc123",
  "tenantId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "550e8400-e29b-41d4-a716-446655440001",
  "ipAddress": "192.168.1.100"
}
```

---

## Future ADRs

The following ADRs are planned for future implementation:

| ADR     | Topic                            | Status |
| ------- | -------------------------------- | ------ |
| ADR-010 | API Versioning Strategy          | Draft  |
| ADR-011 | Caching Strategy (Redis)         | Draft  |
| ADR-012 | File Storage Strategy (S3/MinIO) | Draft  |
| ADR-013 | Internationalization (i18n)      | Draft  |
| ADR-014 | Metrics and Monitoring           | Draft  |
| ADR-015 | Circuit Breaker Pattern          | Draft  |

---

## ADR Template

Use this template for new ADRs:

```markdown
# ADR-XXX: [Title]

**Status:** [Proposed | Accepted | Deprecated | Implemented]  
**Date:** [YYYY-MM-DD]  
**Author:** [Name]

## Context

[Describe the situation and the problem being addressed.]

## Decision

[Describe the proposed solution and why it was chosen.]

## Consequences

### Positive

- [List positive outcomes]

### Negative

- [List negative outcomes]

### Neutral

- [List neutral outcomes]

## Implementation

[Provide code examples or migration steps if applicable.]

## Related ADRs

[Link to related ADRs by number.]
```

---

_Document Version: 1.0.0_  
_Last Updated: January 8, 2026_
