import type { IEvent } from '@nestjs/cqrs';

export class RefundRecordedEvent implements IEvent {
  readonly type = 'RefundRecorded' as const;

  constructor(
    public readonly bookingId: string,
    public readonly tenantId: string,
    public readonly clientEmail: string,
    public readonly clientName: string,
    public readonly eventDate: Date,
    public readonly amount: number,
    public readonly paymentMethod: string,
    public readonly reason: string,
    public readonly totalPrice: number,
    public readonly amountPaid: number,
    public readonly refundAmount: number,
  ) {}
}
