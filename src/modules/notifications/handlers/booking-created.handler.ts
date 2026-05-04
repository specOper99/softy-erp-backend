import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { toErrorMessage } from '../../../common/utils/error.util';
import { BookingCreatedEvent } from '../../bookings/events/booking-created.event';
import { Role } from '../../users/enums/role.enum';
import { UsersService } from '../../users/services/users.service';
import { NotificationType } from '../enums/notification.enum';
import { NotificationService } from '../services/notification.service';

@EventsHandler(BookingCreatedEvent)
export class BookingCreatedNotificationHandler implements IEventHandler<BookingCreatedEvent> {
  private readonly logger = new Logger(BookingCreatedNotificationHandler.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly usersService: UsersService,
  ) {}

  async handle(event: BookingCreatedEvent) {
    this.logger.log(`Handling BookingCreatedEvent for notifications: ${event.bookingId}`);

    // Run within tenant context to ensure proper scoping
    await TenantContextService.run(event.tenantId, async () => {
      try {
        const notifiableUsers = await this.usersService.findByRoles([Role.ADMIN, Role.OPS_MANAGER]);

        for (const user of notifiableUsers) {
          await this.notificationService.createNotification({
            userId: user.id,
            tenantId: event.tenantId,
            type: NotificationType.BOOKING_CREATED,
            title: 'New Booking Created',
            message: `A new booking has been created for ${event.clientName} (${event.packageName}). Event date: ${event.eventDate.toLocaleDateString()}`,
            metadata: {
              bookingId: event.bookingId,
              clientEmail: event.clientEmail,
              totalPrice: event.totalPrice,
              eventDate: event.eventDate.toISOString(),
            },
          });
        }

        this.logger.log(`Created notifications for ${notifiableUsers.length} users for booking ${event.bookingId}`);
      } catch (error) {
        this.logger.error(`Failed to create notifications for booking ${event.bookingId}: ${toErrorMessage(error)}`);
      }
    });
  }
}
