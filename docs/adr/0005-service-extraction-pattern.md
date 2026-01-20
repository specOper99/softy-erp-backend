# ADR-0005: Service Extraction Pattern for Bookings Module

- **Status**: Accepted
- **Date**: 2026-01-17
- **Context**: Bookings module refactoring for maintainability

## Problem Statement

The `BookingsService` had grown to handle multiple distinct responsibilities:
- Core booking CRUD operations
- Client management
- CSV export streaming
- Booking state transitions

This violated the Single Responsibility Principle (SRP) and made the service difficult to test and maintain.

## Decision

Extract specialized services from `BookingsService`:

### Service Hierarchy

```
src/modules/bookings/
├── services/
│   ├── bookings.service.ts          # Core booking CRUD, workflow orchestration
│   ├── clients.service.ts           # Client management, CRUD, tag filtering
│   ├── booking-export.service.ts    # CSV export streaming
│   └── booking-state-machine.service.ts  # State transition validation
```

### BookingExportService

**Responsibility**: Handle all CSV export operations with memory-efficient streaming.

**Key Methods**:
- `exportBookingsToCSV(res: Response)` - Stream bookings export
- `exportClientsToCSV(res: Response)` - Stream clients export

**Dependencies**:
- `Repository<Booking>`
- `Repository<Client>`
- `ExportService` (common streaming utilities)

### ClientsService

**Responsibility**: Manage client entities independently from bookings.

**Key Methods**:
- `create(dto: CreateClientDto)` - Create client
- `findAll(query, tags?)` - List with optional tag filtering
- `findById(id)` - Get single client
- `updateTags(id, tags)` - Manage client tags
- `update(id, dto)` - Update client details
- `delete(id)` - Soft delete with booking validation

**Dependencies**:
- `Repository<Client>`
- `Repository<Booking>` (for deletion validation)
- `AuditService`

## Consequences

### Positive
- Each service has a single, well-defined responsibility
- Easier unit testing with fewer mock dependencies
- Better IDE navigation and discoverability
- Enables parallel development on different features

### Negative
- More files to maintain
- Need to update imports across the codebase
- Slight overhead in DI configuration

## Related Decisions
- ADR-0002: Transactional Outbox Pattern
- ADR-0003: Metrics Authentication Strategy
