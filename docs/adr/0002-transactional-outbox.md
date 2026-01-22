# 2. Transactional Outbox Pattern

Date: 2026-01-16

## Status

Accepted

## Context

We have distributed consistency issues. When a user is created, we publish an event to RabbitMQ/Kafka. If the DB transaction commits but the Message Broker fails (or vice versa), the system creates "Phantom" data or fails to trigger downstream processes (Billing).

## Decision

We will implement the **Transactional Outbox Pattern**.

1. **Transactional Save**: When saving an Entity (e.g., `User`), we ALSO save an `OutboxEvent` record in the SAME database transaction.
   ```typescript
   await manager.transaction(async mgr => {
     const user = await mgr.save(User, userData);
     await mgr.save(OutboxEvent, { aggregateId: user.id, type: 'UserCreated', payload: user });
   });
   ```
2. **Relay Process**: A separate background job (Cron/Queue) polls the `outbox_events` table for unpublished events and publishes them to the Message Broker.
3. **Idempotency**: Consumers must be idempotent as the Relay might publish duplicates in rare crash scenarios.

## Consequences

- **Reliability**: Guarantees at-least-once delivery.
- **Complexity**: We need a new `OutboxEvent` entity and a Relay service.
- **Latency**: Events are no longer real-time (but near real-time).
