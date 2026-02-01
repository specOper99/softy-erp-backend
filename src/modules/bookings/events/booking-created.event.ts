import { IEvent } from '@nestjs/cqrs';

/**
 * Event fired when a new booking is created.
 * This event triggers:
 * - Dashboard metrics updates
 * - Notification to assigned staff
 * - Webhook notifications to external systems
 * - Analytics tracking
 */
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
