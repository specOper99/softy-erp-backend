import { IEvent } from '@nestjs/cqrs';

export class UserDeletedEvent implements IEvent {
  constructor(
    public readonly userId: string,
    public readonly tenantId: string,
    public readonly email: string,
  ) {}
}
