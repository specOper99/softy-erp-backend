import { IEvent } from '@nestjs/cqrs';

export class PaymentRecordedEvent implements IEvent {
  constructor(
    public readonly bookingId: string,
    public readonly tenantId: string,
    public readonly clientEmail: string,
    public readonly clientName: string,
    public readonly eventDate: Date,
    public readonly amount: number,
    public readonly paymentMethod: string,
    public readonly reference: string,
    public readonly totalPrice: number,
    public readonly amountPaid: number,
  ) {}
}
