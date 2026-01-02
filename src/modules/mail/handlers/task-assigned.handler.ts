import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { TaskAssignedEvent } from '../../tasks/events/task-assigned.event';
import { MailService } from '../mail.service';

@EventsHandler(TaskAssignedEvent)
export class TaskAssignedHandler implements IEventHandler<TaskAssignedEvent> {
  constructor(private readonly mailService: MailService) {}

  async handle(event: TaskAssignedEvent) {
    await this.mailService.sendTaskAssignment({
      employeeName: event.employeeName,
      employeeEmail: event.employeeEmail,
      taskType: event.taskTypeName,
      clientName: event.clientName,
      eventDate: event.eventDate,
      commission: event.commission,
    });
  }
}
