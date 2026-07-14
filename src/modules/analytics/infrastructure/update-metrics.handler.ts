import { Logger, Optional } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { format } from 'date-fns';
import { DURABLE_FINANCIAL_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { isDuplicateKeyError, toErrorMessage } from '../../../common/utils/error.util';
import { BookingCancelledEvent } from '../../bookings/domain/events/booking-cancelled.event';
import { BookingConfirmedEvent } from '../../bookings/domain/events/booking-confirmed.event';
import { PaymentRecordedEvent } from '../../bookings/domain/events/payment-recorded.event';
import { TaskCompletedEvent } from '../../tasks/domain/events/task-completed.event';
import { DailyMetricsRepository } from './daily-metrics.repository';

@EventsHandler(BookingConfirmedEvent, TaskCompletedEvent, BookingCancelledEvent, PaymentRecordedEvent)
export class UpdateMetricsHandler
  implements
    IEventHandler<BookingConfirmedEvent>,
    IEventHandler<TaskCompletedEvent>,
    IEventHandler<BookingCancelledEvent>,
    IEventHandler<PaymentRecordedEvent>
{
  private readonly logger = new Logger(UpdateMetricsHandler.name);

  constructor(
    private readonly metricsRepository: DailyMetricsRepository,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  async handle(event: BookingConfirmedEvent | TaskCompletedEvent | BookingCancelledEvent | PaymentRecordedEvent) {
    const tenantId = event.tenantId;
    // Metrics date policy:
    //   BookingConfirmed / PaymentRecorded → date the action was taken (today).
    //   TaskCompleted                      → the actual completion date.
    //   BookingCancelled                   → the cancellation date.
    // All sales/revenue metrics reflect the action date so the dashboard shows
    // "what happened today" rather than "what is the event date".

    const today = format(new Date(), 'yyyy-MM-dd');

    // Resolve date and increments via discriminated union switch.
    // Adding a new event type to the @EventsHandler decorator will produce a
    // TypeScript error here (via the never exhaustiveness check) until the
    // switch is updated — preventing silent metric gaps.
    let dateStr: string;
    let increments: Parameters<UpdateMetricsHandler['incrementMetric']>[2];

    switch (event.type) {
      case 'BookingConfirmed':
        // "Performance Dashboard" tracks sales made today (action date), not the event date.
        dateStr = today;
        increments = { bookingsCount: 1 };
        break;
      case 'TaskCompleted':
        dateStr = format(new Date(event.completedAt), 'yyyy-MM-dd');
        increments = { tasksCompletedCount: 1 };
        break;
      case 'BookingCancelled':
        dateStr = format(new Date(event.cancelledAt), 'yyyy-MM-dd');
        increments = { cancellationsCount: 1 };
        break;
      case 'PaymentRecorded':
        // Durable financial outbox owns payment revenue when flag is ON.
        if (this.flagsService?.isEnabled(DURABLE_FINANCIAL_EVENTS_FLAG, {}, true) ?? true) {
          this.logger.debug(`Skipping legacy CQRS metrics for PaymentRecordedEvent (durable path on)`);
          return;
        }
        // Revenue tracked on collection date.
        dateStr = today;
        increments = { totalRevenue: event.amount };
        break;
      default: {
        void event;
        return;
      }
    }

    await TenantContextService.run(tenantId, async () => {
      try {
        await this.incrementMetric(tenantId, dateStr, increments);
      } catch (error) {
        this.logger.error(`Failed to update daily metrics for tenant ${tenantId}: ${toErrorMessage(error)}`);
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
      if (!isDuplicateKeyError(error)) throw error;

      const counterUpdates: Array<[keyof typeof increments, number]> = [
        ['bookingsCount', bookingsCount],
        ['tasksCompletedCount', tasksCompletedCount],
        ['activeClientsCount', activeClientsCount],
        ['cancellationsCount', cancellationsCount],
        ['totalRevenue', totalRevenue],
      ];
      for (const [field, value] of counterUpdates) {
        if (value > 0) await this.metricsRepository.increment({ tenantId, date }, field, value);
      }
    }
  }
}
