import type { IEvent } from '@nestjs/cqrs';

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
