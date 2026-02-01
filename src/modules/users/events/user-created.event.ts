import { IEvent } from '@nestjs/cqrs';

/**
 * Event fired when a new user is created.
 * This event triggers:
 * - Profile creation in HR module
 * - Welcome email sending
 * - Wallet initialization if applicable
 * - Analytics tracking
 * - Webhook notifications
 */
export class UserCreatedEvent implements IEvent {
  constructor(
    public readonly userId: string,
    public readonly tenantId: string,
    public readonly email: string,
    public readonly role: string,
    public readonly createdBy: string | undefined,
    public readonly createdAt: Date,
  ) {}
}

/**
 * Event fired when a user is updated.
 * This event triggers:
 * - Profile sync if name/email changed
 * - Webhook notifications with changes
 */
export class UserUpdatedEvent implements IEvent {
  constructor(
    public readonly userId: string,
    public readonly tenantId: string,
    public readonly changes: Record<string, { old: unknown; new: unknown }>,
    public readonly updatedAt: Date,
  ) {}

  get emailChanged(): boolean {
    return 'email' in this.changes;
  }

  get roleChanged(): boolean {
    return 'role' in this.changes;
  }
}
