import { Logger, Optional } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DURABLE_NOTIFICATION_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { runGuardedDispatch } from '../../../common/utils/event-dispatch.util';
import { BookingCompletedEvent } from '../../bookings/domain/events/booking-completed.event';
import { Role } from '../../users/domain/enums/role.enum';
import { UsersService } from '../../users/application/users.service';
import { NotificationType } from '../domain/enums/notification.enum';
import { NotificationService } from './notification.service';

@EventsHandler(BookingCompletedEvent)
export class BookingCompletedNotificationHandler implements IEventHandler<BookingCompletedEvent> {
  private readonly logger = new Logger(BookingCompletedNotificationHandler.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly usersService: UsersService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  async handle(event: BookingCompletedEvent): Promise<void> {
    if (this.flagsService?.isEnabled(DURABLE_NOTIFICATION_EVENTS_FLAG, {}, true) ?? true) {
      this.logger.debug(`Skipping legacy CQRS notification for BookingCompletedEvent (durable path on)`);
      return;
    }

    this.logger.log(`Handling BookingCompletedEvent for notifications: ${event.bookingId}`);

    await TenantContextService.run(event.tenantId, async () =>
      runGuardedDispatch(
        this.logger,
        { failureMessage: `Failed to create notifications for completed booking ${event.bookingId}` },
        async () => {
          const notifiableUsers = await this.usersService.findByRoles([Role.ADMIN, Role.OPS_MANAGER]);

          for (const user of notifiableUsers) {
            await this.notificationService.createNotification({
              userId: user.id,
              tenantId: event.tenantId,
              type: NotificationType.BOOKING_COMPLETED,
              title: 'Booking Completed',
              message: `Booking ${event.bookingId} was marked completed.`,
              metadata: {
                bookingId: event.bookingId,
                completedAt: event.completedAt.toISOString(),
              },
            });
          }

          this.logger.log(
            `Created notifications for ${notifiableUsers.length} users for completed booking ${event.bookingId}`,
          );
        },
      ),
    );
  }
}
