import { IEvent } from '@nestjs/cqrs';

export class TaskAssignedEvent implements IEvent {
  constructor(
    public readonly taskId: string,
    public readonly tenantId: string,
    public readonly employeeName: string,
    public readonly employeeEmail: string,
    public readonly taskTypeName: string,
    public readonly clientName: string,
    public readonly eventDate: Date,
    public readonly commission: number,
  ) {}
}
