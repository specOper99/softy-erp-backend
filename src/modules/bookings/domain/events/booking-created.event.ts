import type { IEvent } from '@nestjs/cqrs';

export class BookingCreatedEvent implements IEvent {
  constructor(
    public readonly bookingId: string,
    public readonly tenantId: string,
    public readonly clientId: string,
    public readonly clientEmail: string,
    public readonly clientName: string,
    public readonly packageId: string,
    public readonly packageName: string,
    public readonly totalPrice: number,
    public readonly assignedUserId: string | null,
    public readonly eventDate: Date,
    public readonly createdAt: Date,
  ) {}
}
