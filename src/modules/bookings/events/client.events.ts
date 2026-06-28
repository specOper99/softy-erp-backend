import type { IEvent } from '@nestjs/cqrs';

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

export class ClientUpdatedEvent implements IEvent {
  constructor(
    public readonly clientId: string,
    public readonly tenantId: string,
    public readonly changes: Record<string, { old: unknown; new: unknown }>,
    public readonly updatedAt: Date,
  ) {}
}

export class ClientDeletedEvent implements IEvent {
  constructor(
    public readonly clientId: string,
    public readonly tenantId: string,
    public readonly email: string,
    public readonly deletedAt: Date,
  ) {}
}
