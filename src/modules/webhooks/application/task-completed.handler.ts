import { Logger, Optional } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DURABLE_WEBHOOK_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { runWebhookDispatch } from '../../../common/utils/event-dispatch.util';
import { TaskCompletedEvent } from '../../tasks/domain/events/task-completed.event';
import { WebhookService } from './webhooks.service';

@EventsHandler(TaskCompletedEvent)
export class TaskCompletedWebhookHandler implements IEventHandler<TaskCompletedEvent> {
  private readonly logger = new Logger(TaskCompletedWebhookHandler.name);

  constructor(
    private readonly webhookService: WebhookService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  handle(event: TaskCompletedEvent): Promise<void> {
    if (this.flagsService?.isEnabled(DURABLE_WEBHOOK_EVENTS_FLAG, {}, true) ?? true) {
      this.logger.debug(`Skipping legacy CQRS webhook for TaskCompletedEvent (durable path on)`);
      return Promise.resolve();
    }

    return runWebhookDispatch(this.logger, 'TaskCompletedEvent', 'task', event.taskId, () =>
      this.webhookService.emit({
        type: 'task.completed',
        tenantId: event.tenantId,
        payload: {
          taskId: event.taskId,
          completedAt: event.completedAt.toISOString(),
          commissionAccrued: event.commissionAccrued,
          assignedUserId: event.assignedUserId,
        },
        timestamp: event.completedAt.toISOString(),
      }),
    );
  }
}
