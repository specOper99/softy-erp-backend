import { IEvent } from '@nestjs/cqrs';

export class BookingCompletedEvent implements IEvent {
  constructor(
    public readonly bookingId: string,
    public readonly tenantId: string,
    public readonly completedAt: Date,
  ) {}
}
