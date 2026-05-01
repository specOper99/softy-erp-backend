import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { format } from 'date-fns';
import { TenantContextService } from '../../../common/services/tenant-context.service';
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
    // Metrics date policy:
    //   BookingConfirmed / PaymentRecorded → date the action was taken (today).
    //   TaskCompleted                      → the actual completion date.
    //   BookingCancelled                   → the cancellation date.
    // All sales/revenue metrics reflect the action date so the dashboard shows
    // "what happened today" rather than "what is the event date".

    const today = format(new Date(), 'yyyy-MM-dd');
    let dateStr: string;

    if (event instanceof BookingConfirmedEvent) {
      // "Performance Dashboard" tracks sales made today (action date), not the event date.
      dateStr = today;
    } else if (event instanceof TaskCompletedEvent) {
      dateStr = format(new Date(event.completedAt), 'yyyy-MM-dd');
    } else if (event instanceof BookingCancelledEvent) {
      dateStr = format(new Date(event.cancelledAt), 'yyyy-MM-dd');
    } else {
      // PaymentRecordedEvent and fallback: revenue tracked on collection date.
      dateStr = today;
    }

    await TenantContextService.run(tenantId, async () => {
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
    });
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
      const isDuplicate = (() => {
        if (!error || typeof error !== 'object') return false;
        const dbError = error as { code?: unknown; message?: unknown; driverError?: { code?: unknown } };
        return (
          dbError.code === '23505' ||
          (typeof dbError.message === 'string' && dbError.message.includes('UNIQUE constraint failed')) ||
          dbError.driverError?.code === 'SQLITE_CONSTRAINT'
        );
      })();

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
