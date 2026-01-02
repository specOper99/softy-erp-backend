import { IEvent } from '@nestjs/cqrs';

export class BookingUpdatedEvent implements IEvent {
  constructor(
    public readonly bookingId: string,
    public readonly tenantId: string,
    public readonly changes: Record<string, unknown>,
    public readonly updatedAt: Date,
  ) {}
}
