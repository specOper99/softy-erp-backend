import { Logger, Optional } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DURABLE_NOTIFICATION_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { runGuardedDispatch } from '../../../common/utils/event-dispatch.util';
import { TaskCompletedEvent } from '../../tasks/domain/events/task-completed.event';
import { NotificationType } from '../domain/enums/notification.enum';
import { NotificationService } from './notification.service';

@EventsHandler(TaskCompletedEvent)
export class TaskCompletedNotificationHandler implements IEventHandler<TaskCompletedEvent> {
  private readonly logger = new Logger(TaskCompletedNotificationHandler.name);

  constructor(
    private readonly notificationService: NotificationService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  async handle(event: TaskCompletedEvent): Promise<void> {
    if (this.flagsService?.isEnabled(DURABLE_NOTIFICATION_EVENTS_FLAG, {}, true) ?? true) {
      this.logger.debug(`Skipping legacy CQRS notification for TaskCompletedEvent (durable path on)`);
      return;
    }

    this.logger.log(`Handling TaskCompletedEvent for notifications: ${event.taskId}`);

    await TenantContextService.run(event.tenantId, async () =>
      runGuardedDispatch(
        this.logger,
        { failureMessage: `Failed to create notification for completed task ${event.taskId}` },
        async () => {
          await this.notificationService.createNotification({
            userId: event.assignedUserId,
            tenantId: event.tenantId,
            type: NotificationType.TASK_COMPLETED,
            title: 'Task Completed',
            message: `Task completed. Commission accrued: ${event.commissionAccrued}.`,
            metadata: {
              taskId: event.taskId,
              assignedUserId: event.assignedUserId,
              completedAt: event.completedAt.toISOString(),
              commissionAccrued: event.commissionAccrued,
            },
          });

          this.logger.log(`Created notification for completed task ${event.taskId}`);
        },
      ),
    );
  }
}
