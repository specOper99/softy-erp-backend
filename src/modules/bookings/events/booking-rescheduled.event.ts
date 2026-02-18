import { IEvent } from '@nestjs/cqrs';

export class BookingRescheduledEvent implements IEvent {
  constructor(
    public readonly bookingId: string,
    public readonly tenantId: string,
    public readonly eventDate: Date,
    public readonly startTime: string | null,
    public readonly staffEmails: string[],
  ) {}
}
