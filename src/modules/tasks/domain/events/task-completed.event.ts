import type { IEvent } from '@nestjs/cqrs';

export class TaskCompletedEvent implements IEvent {
  readonly type = 'TaskCompleted' as const;

  constructor(
    public readonly taskId: string,
    public readonly tenantId: string,
    public readonly completedAt: Date,
    public readonly commissionAccrued: number,
    public readonly assignedUserId: string,
  ) {}
}
