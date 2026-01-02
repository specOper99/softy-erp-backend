import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { TaskCompletedEvent } from '../../tasks/events/task-completed.event';
import { WebhookService } from '../webhooks.service';

@EventsHandler(TaskCompletedEvent)
export class TaskCompletedWebhookHandler implements IEventHandler<TaskCompletedEvent> {
  constructor(private readonly webhookService: WebhookService) {}

  async handle(event: TaskCompletedEvent) {
    await this.webhookService.emit({
      type: 'task.completed',
      tenantId: event.tenantId,
      payload: {
        taskId: event.taskId,
        assignedUserId: event.assignedUserId,
        completedAt: event.completedAt,
        commissionAccrued: event.commissionAccrued,
      },
      timestamp: new Date().toISOString(),
    });
  }
}
