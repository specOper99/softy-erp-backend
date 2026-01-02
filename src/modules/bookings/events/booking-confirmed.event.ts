import { IEvent } from '@nestjs/cqrs';

export class BookingConfirmedEvent implements IEvent {
  constructor(
    public readonly bookingId: string,
    public readonly tenantId: string,
    public readonly clientEmail: string,
    public readonly clientName: string,
    public readonly packageName: string,
    public readonly totalPrice: number,
    public readonly eventDate: Date,
  ) {}
}
