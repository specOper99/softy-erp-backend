import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { TaskCompletedEvent } from '../../tasks/events/task-completed.event';
import { runWebhookDispatch } from '../../../common/utils/event-dispatch.util';

@EventsHandler(TaskCompletedEvent)
export class TaskCompletedWebhookHandler implements IEventHandler<TaskCompletedEvent> {
  private readonly logger = new Logger(TaskCompletedWebhookHandler.name);

  handle(event: TaskCompletedEvent): Promise<void> {
    return runWebhookDispatch(this.logger, 'TaskCompletedEvent', 'task', event.taskId, () => {
      // TODO: dispatch outbound webhook to registered tenant endpoints
    });
  }
}
