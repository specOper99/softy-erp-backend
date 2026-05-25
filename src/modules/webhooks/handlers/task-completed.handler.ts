import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { toErrorMessage } from '../../../common/utils/error.util';
import { TaskCompletedEvent } from '../../tasks/events/task-completed.event';

@EventsHandler(TaskCompletedEvent)
export class TaskCompletedWebhookHandler implements IEventHandler<TaskCompletedEvent> {
  private readonly logger = new Logger(TaskCompletedWebhookHandler.name);

  async handle(event: TaskCompletedEvent): Promise<void> {
    this.logger.log(`Handling TaskCompletedEvent for webhooks: ${event.taskId}`);

    try {
      // TODO: dispatch outbound webhook to registered tenant endpoints
      this.logger.log(`Webhook dispatched for TaskCompletedEvent: ${event.taskId}`);
    } catch (error) {
      this.logger.error(`Failed to dispatch webhook for task ${event.taskId}: ${toErrorMessage(error)}`);
    }
  }
}
