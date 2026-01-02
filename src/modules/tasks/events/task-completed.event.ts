import { IEvent } from '@nestjs/cqrs';

export class TaskCompletedEvent implements IEvent {
  constructor(
    public readonly taskId: string,
    public readonly tenantId: string,
    public readonly completedAt: Date,
    public readonly commissionAccrued: number,
    public readonly assignedUserId: string,
  ) {}
}
