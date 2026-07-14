import type { IEvent } from '@nestjs/cqrs';

export class BookingConfirmedEvent implements IEvent {
  readonly type = 'BookingConfirmed' as const;

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
