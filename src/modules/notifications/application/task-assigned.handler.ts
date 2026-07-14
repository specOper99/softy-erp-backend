import { Logger, Optional } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DURABLE_NOTIFICATION_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { runGuardedDispatch } from '../../../common/utils/event-dispatch.util';
import { TaskAssignedEvent } from '../../tasks/domain/events/task-assigned.event';
import { UsersService } from '../../users/application/users.service';
import { NotificationType } from '../domain/enums/notification.enum';
import { NotificationService } from './notification.service';

@EventsHandler(TaskAssignedEvent)
export class TaskAssignedNotificationHandler implements IEventHandler<TaskAssignedEvent> {
  private readonly logger = new Logger(TaskAssignedNotificationHandler.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly usersService: UsersService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  async handle(event: TaskAssignedEvent): Promise<void> {
    if (this.flagsService?.isEnabled(DURABLE_NOTIFICATION_EVENTS_FLAG, {}, true) ?? true) {
      this.logger.debug(`Skipping legacy CQRS notification for TaskAssignedEvent (durable path on)`);
      return;
    }

    this.logger.log(`Handling TaskAssignedEvent for notifications: ${event.taskId}`);

    await TenantContextService.run(event.tenantId, async () =>
      runGuardedDispatch(
        this.logger,
        { failureMessage: `Failed to create notification for task assignment ${event.taskId}` },
        async () => {
          const user = await this.usersService.findByEmail(event.employeeEmail, event.tenantId);
          if (!user) {
            this.logger.warn(`No notification recipient found for TaskAssignedEvent ${event.taskId}`);
            return;
          }

          await this.notificationService.createNotification({
            userId: user.id,
            tenantId: event.tenantId,
            type: NotificationType.TASK_ASSIGNED,
            title: 'Task Assigned',
            message: `You have been assigned ${event.processingTypeName} for ${event.clientName}. Event date: ${event.eventDate.toLocaleDateString()}`,
            metadata: {
              taskId: event.taskId,
              employeeEmail: event.employeeEmail,
              employeeName: event.employeeName,
              processingTypeName: event.processingTypeName,
              clientName: event.clientName,
              eventDate: event.eventDate.toISOString(),
              commission: event.commission,
            },
          });

          this.logger.log(`Created notification for task assignment ${event.taskId}`);
        },
      ),
    );
  }
}
