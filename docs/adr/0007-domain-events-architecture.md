# ADR-0007: Domain Events Architecture

**Status:** Accepted  
**Date:** 2026-02-01  
**Authors:** Architecture Team  

## Context

Softy ERP modules need to react to state changes in other modules without tight coupling. A consistency audit revealed that many critical operations (booking creation, transaction recording, client updates) were not publishing events, causing:

1. Dashboard metrics out of sync with actual data
2. Webhook notifications not firing for important business events
3. Analytics data missing recent operations
4. Notification system unaware of events requiring user alerts

## Decision

We adopt a domain event architecture using NestJS CQRS `EventBus` with the following patterns:

### 1. Event Structure

**All domain events MUST include `tenantId`:**

```typescript
import { IEvent } from '@nestjs/cqrs';

export class BookingCreatedEvent implements IEvent {
  constructor(
    public readonly bookingId: string,
    public readonly tenantId: string,     // REQUIRED
    public readonly clientId: string,
    public readonly packageId: string,
    public readonly totalPrice: number,
    public readonly createdAt: Date,
  ) {}
}
```

### 2. Event Naming Conventions

| Pattern | Example | When to Use |
|---------|---------|-------------|
| `{Entity}CreatedEvent` | `BookingCreatedEvent` | New entity persisted |
| `{Entity}UpdatedEvent` | `ClientUpdatedEvent` | Entity modified (include changes) |
| `{Entity}DeletedEvent` | `PackageDeletedEvent` | Entity removed |
| `{Entity}{Action}Event` | `BookingConfirmedEvent` | Significant state transition |
| `{Domain}FailedEvent` | `TransactionFailedEvent` | Operation failure (for alerting) |

### 3. Event Publication

**Publish events AFTER successful persistence:**

```typescript
@Injectable()
export class BookingsService {
  constructor(
    private readonly eventBus: EventBus,
    private readonly bookingRepository: BookingRepository,
  ) {}

  async create(dto: CreateBookingDto): Promise<Booking> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    
    // 1. Create and persist
    const booking = this.bookingRepository.create({ ... });
    const saved = await this.bookingRepository.save(booking);
    
    // 2. Publish event AFTER save succeeds
    this.eventBus.publish(
      new BookingCreatedEvent(
        saved.id,
        tenantId,
        saved.clientId,
        saved.packageId,
        saved.totalPrice,
        saved.createdAt,
      ),
    );
    
    return saved;
  }
}
```

### 4. Event Handlers

**Handlers MUST establish tenant context:**

```typescript
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';

@EventsHandler(BookingCreatedEvent)
export class BookingCreatedHandler implements IEventHandler<BookingCreatedEvent> {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly webhookService: WebhookService,
  ) {}

  async handle(event: BookingCreatedEvent): Promise<void> {
    // Run within tenant context
    await TenantContextService.run(event.tenantId, async () => {
      // Send notification
      await this.notificationService.notifyBookingCreated(event);
      
      // Trigger webhooks
      await this.webhookService.dispatch('booking.created', event);
    });
  }
}
```

### 5. Required Events by Module

| Module | Events Required |
|--------|-----------------|
| **Bookings** | `BookingCreatedEvent`, `BookingUpdatedEvent`, `BookingConfirmedEvent`, `BookingCancelledEvent` |
| **Finance** | `TransactionCreatedEvent`, `WalletBalanceUpdatedEvent`, `PayoutFailedEvent` |
| **Catalog** | `PackageCreatedEvent`, `PackageUpdatedEvent`, `PackagePriceChangedEvent`, `PackageDeletedEvent` |
| **Clients** | `ClientCreatedEvent`, `ClientUpdatedEvent`, `ClientDeletedEvent` |
| **Users** | `UserCreatedEvent`, `UserUpdatedEvent`, `UserDeletedEvent`, `UserDeactivatedEvent` |
| **Tasks** | `TaskCreatedEvent`, `TaskCompletedEvent`, `TaskAssignedEvent` |

### 6. Update Events with Changes

**Include a `changes` map for update events:**

```typescript
export class ClientUpdatedEvent implements IEvent {
  constructor(
    public readonly clientId: string,
    public readonly tenantId: string,
    public readonly changes: Record<string, { old: unknown; new: unknown }>,
    public readonly updatedAt: Date,
  ) {}
}

// Usage
const changes: Record<string, { old: unknown; new: unknown }> = {};
if (dto.email !== client.email) {
  changes['email'] = { old: client.email, new: dto.email };
}
this.eventBus.publish(new ClientUpdatedEvent(client.id, tenantId, changes, new Date()));
```

### 7. Transactional Considerations

For critical financial operations, use the **Transactional Outbox** pattern (see ADR-0002):

```typescript
// For non-critical events: publish after save
await this.repository.save(entity);
this.eventBus.publish(new EntityCreatedEvent(...));

// For critical events (e.g., payments): use outbox
await this.outboxService.scheduleEvent(
  new PaymentProcessedEvent(...),
  { afterCommit: true },
);
```

## Consequences

### Positive
- Loose coupling between modules
- Reliable cross-module reactions to state changes
- Webhook and notification consistency
- Audit trail of all significant events
- Easier testing (mock EventBus)

### Negative
- Eventual consistency (handlers run asynchronously)
- Need to handle handler failures gracefully
- Event versioning required for schema changes

### Neutral
- Handlers must be idempotent (events may be redelivered)
- Events are not persisted by default (use outbox for durability)

## Event Handler Registration

Handlers are auto-discovered when:
1. Decorated with `@EventsHandler(EventClass)`
2. Exported from a module that imports `CqrsModule`

```typescript
@Module({
  imports: [CqrsModule],
  providers: [BookingCreatedHandler, BookingUpdatedHandler],
})
export class BookingsModule {}
```

## Testing Events

```typescript
describe('BookingsService', () => {
  let eventBus: jest.Mocked<EventBus>;
  
  beforeEach(() => {
    eventBus = { publish: jest.fn() } as any;
  });
  
  it('should publish BookingCreatedEvent on create', async () => {
    await service.create(dto);
    
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: expect.any(String),
        tenantId: 'test-tenant',
      }),
    );
  });
});
```

## Related ADRs

- ADR-0002: Transactional Outbox
- ADR-0006: Tenant Isolation Patterns

## References

- [NestJS CQRS Documentation](https://docs.nestjs.com/recipes/cqrs)
- [Domain Events Pattern](https://martinfowler.com/eaaDev/DomainEvent.html)
