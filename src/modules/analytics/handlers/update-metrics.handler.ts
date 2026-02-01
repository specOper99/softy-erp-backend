import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { BookingCancelledEvent } from '../../bookings/events/booking-cancelled.event';
import { BookingConfirmedEvent } from '../../bookings/events/booking-confirmed.event';
import { PaymentRecordedEvent } from '../../bookings/events/payment-recorded.event';
import { TaskCompletedEvent } from '../../tasks/events/task-completed.event';
import { DailyMetricsRepository } from '../repositories/daily-metrics.repository';

@EventsHandler(BookingConfirmedEvent, TaskCompletedEvent, BookingCancelledEvent, PaymentRecordedEvent)
export class UpdateMetricsHandler
  implements
    IEventHandler<BookingConfirmedEvent>,
    IEventHandler<TaskCompletedEvent>,
    IEventHandler<BookingCancelledEvent>,
    IEventHandler<PaymentRecordedEvent>
{
  private readonly logger = new Logger(UpdateMetricsHandler.name);

  constructor(private readonly metricsRepository: DailyMetricsRepository) {}

  async handle(event: BookingConfirmedEvent | TaskCompletedEvent | BookingCancelledEvent | PaymentRecordedEvent) {
    const tenantId = event.tenantId;
    // Use event date or current date for metrics?
    // Usually metrics are based on when the event happened (eventDate usually refers to the booking event date, not creation date).
    // For "Daily Metrics", we usually care about "Business Activity on that day".
    // If a booking is confirmed TODAY for an event NEXT YEAR, does revenue count for TODAY or NEXT YEAR?
    // Accounting principles usually book revenue when earned (service delivered).
    // However, for a "Sales Dashboard", we want to see "Sales made today".
    // Let's stick to "Date of Action" (Booking Confirmation Date) for Sales Metrics.
    // For Task Completed, it's completion date.

    let dateStr: string;

    if (event instanceof BookingConfirmedEvent) {
      // If we want "Sales made today", we should use current date.
      // If we want "Revenue for Event Date", we use event.eventDate.
      // Let's assume "Performance Dashboard" = "What did we sell today?"
      dateStr = new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);
    } else if (event instanceof TaskCompletedEvent) {
      dateStr = new Date(event.completedAt).toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);
    } else if (event instanceof BookingCancelledEvent) {
      dateStr = new Date(event.cancelledAt).toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);
    } else if (event instanceof PaymentRecordedEvent) {
      // Revenue metrics based on collection date (today)
      dateStr = new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);
    } else {
      dateStr = new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);
    }

    try {
      if (event instanceof BookingConfirmedEvent) {
        await this.incrementMetric(tenantId, dateStr, {
          bookingsCount: 1,
          // totalRevenue removed here. Tracked on payment.
        });
      } else if (event instanceof TaskCompletedEvent) {
        await this.incrementMetric(tenantId, dateStr, {
          tasksCompletedCount: 1,
        });
      } else if (event instanceof BookingCancelledEvent) {
        await this.incrementMetric(tenantId, dateStr, {
          cancellationsCount: 1,
        });
      } else if (event instanceof PaymentRecordedEvent) {
        await this.incrementMetric(tenantId, dateStr, {
          totalRevenue: event.amount,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to update daily metrics for tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async incrementMetric(
    tenantId: string,
    date: string,
    increments: {
      bookingsCount?: number;
      tasksCompletedCount?: number;
      activeClientsCount?: number;
      cancellationsCount?: number;
      totalRevenue?: number;
    },
  ) {
    // Upsert logic
    // We can use a raw query or try-catch insert/update.
    // Postgres supports ON CONFLICT.

    const {
      bookingsCount = 0,
      tasksCompletedCount = 0,
      activeClientsCount = 0,
      cancellationsCount = 0,
      totalRevenue = 0,
    } = increments;

    try {
      await this.metricsRepository.insert({
        tenantId,
        date,
        bookingsCount,
        tasksCompletedCount,
        activeClientsCount,
        cancellationsCount,
        totalRevenue,
      });
    } catch (error: unknown) {
      const dbError = error as {
        code?: string;
        message?: string;
        driverError?: { code?: string };
      };
      const isDuplicate =
        dbError.code === '23505' ||
        dbError.message?.includes('UNIQUE constraint failed') ||
        dbError.driverError?.code === 'SQLITE_CONSTRAINT';

      if (isDuplicate) {
        if (bookingsCount > 0)
          await this.metricsRepository.increment({ tenantId, date }, 'bookingsCount', bookingsCount);
        if (tasksCompletedCount > 0)
          await this.metricsRepository.increment({ tenantId, date }, 'tasksCompletedCount', tasksCompletedCount);
        if (activeClientsCount > 0)
          await this.metricsRepository.increment({ tenantId, date }, 'activeClientsCount', activeClientsCount);
        if (cancellationsCount > 0)
          await this.metricsRepository.increment({ tenantId, date }, 'cancellationsCount', cancellationsCount);
        if (totalRevenue > 0) await this.metricsRepository.increment({ tenantId, date }, 'totalRevenue', totalRevenue);
      } else {
        throw error;
      }
    }
  }
}
