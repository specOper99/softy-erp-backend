import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { BookingUpdatedEvent } from '../../../bookings/events/booking-updated.event';
import { FinancialReportService } from '../../services/financial-report.service';

@EventsHandler(BookingUpdatedEvent)
export class BookingUpdatedHandler implements IEventHandler<BookingUpdatedEvent> {
  private readonly logger = new Logger(BookingUpdatedHandler.name);

  constructor(private readonly financialReportService: FinancialReportService) {}

  async handle(event: BookingUpdatedEvent) {
    this.logger.log(
      `Handling booking update for ${event.bookingId} in tenant ${event.tenantId} to invalidate financial reports.`,
    );
    try {
      await this.financialReportService.invalidateReportCaches(event.tenantId);
      this.logger.log(`Successfully invalidated financial report caches for tenant ${event.tenantId}`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to handle booking update event for tenant ${event.tenantId}: ${err.message}`,
        err.stack,
      );
    }
  }
}
