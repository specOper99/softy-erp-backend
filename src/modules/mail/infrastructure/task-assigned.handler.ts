import { Logger, Optional } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DURABLE_MAIL_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { TaskAssignedEvent } from '../../tasks/domain/events/task-assigned.event';
import { MailService } from '../application/mail.service';

@EventsHandler(TaskAssignedEvent)
export class TaskAssignedHandler implements IEventHandler<TaskAssignedEvent> {
  private readonly logger = new Logger(TaskAssignedHandler.name);

  constructor(
    private readonly mailService: MailService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  async handle(event: TaskAssignedEvent) {
    if (this.flagsService?.isEnabled(DURABLE_MAIL_EVENTS_FLAG, {}, true) ?? true) {
      this.logger.debug(`Skipping legacy CQRS mail for TaskAssignedEvent (durable path on)`);
      return;
    }

    await this.mailService.sendTaskAssignment({
      employeeName: event.employeeName,
      employeeEmail: event.employeeEmail,
      processingType: event.processingTypeName,
      clientName: event.clientName,
      eventDate: event.eventDate,
      commission: event.commission,
    });
  }
}
