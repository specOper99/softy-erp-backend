import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { BookingCreatedEvent } from '../../bookings/events/booking-created.event';
import { DashboardGateway } from '../dashboard.gateway';

@EventsHandler(BookingCreatedEvent)
export class DashboardBookingCreatedHandler implements IEventHandler<BookingCreatedEvent> {
  private readonly logger = new Logger(DashboardBookingCreatedHandler.name);

  constructor(private readonly dashboardGateway: DashboardGateway) {}

  async handle(event: BookingCreatedEvent): Promise<void> {
    await TenantContextService.run(event.tenantId, async () => {
      try {
        this.dashboardGateway.broadcastMetricsUpdate(event.tenantId, 'BOOKING', {
          action: 'CREATED',
          bookingId: event.bookingId,
          packageId: event.packageId,
          eventDate: event.eventDate,
          totalPrice: event.totalPrice,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to broadcast booking created event: ${message}`);
      }
    });
  }
}
