import { IEvent } from '@nestjs/cqrs';

/**
 * Event fired when a new client is created.
 * This event triggers:
 * - CRM sync to external systems
 * - Welcome notification/email
 * - Analytics tracking
 * - Webhook notifications
 */
export class ClientCreatedEvent implements IEvent {
  constructor(
    public readonly clientId: string,
    public readonly tenantId: string,
    public readonly email: string,
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly phone: string | undefined,
    public readonly tags: string[],
    public readonly createdAt: Date,
  ) {}

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }
}

/**
 * Event fired when a client is updated.
 * This event triggers:
 * - CRM sync to external systems
 * - Webhook notifications with changes
 */
export class ClientUpdatedEvent implements IEvent {
  constructor(
    public readonly clientId: string,
    public readonly tenantId: string,
    public readonly changes: Record<string, { old: unknown; new: unknown }>,
    public readonly updatedAt: Date,
  ) {}
}

/**
 * Event fired when a client is deleted.
 * This event triggers:
 * - CRM sync to external systems (deletion)
 * - Cleanup of related data
 * - Webhook notifications
 */
export class ClientDeletedEvent implements IEvent {
  constructor(
    public readonly clientId: string,
    public readonly tenantId: string,
    public readonly email: string,
    public readonly deletedAt: Date,
  ) {}
}
