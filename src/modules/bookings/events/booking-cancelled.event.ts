import { IEvent } from '@nestjs/cqrs';

export class BookingCancelledEvent implements IEvent {
  constructor(
    public readonly bookingId: string,
    public readonly tenantId: string,
    public readonly clientEmail: string,
    public readonly clientName: string,
    public readonly eventDate: Date,
    public readonly cancelledAt: Date,
    public readonly daysBeforeEvent: number,
    public readonly cancellationReason: string,
    public readonly amountPaid: number,
    public readonly refundAmount: number,
    public readonly refundPercentage: number,
  ) {}
}
