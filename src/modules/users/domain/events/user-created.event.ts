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
