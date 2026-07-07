import { NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { TaskAssignee } from '../entities/task-assignee.entity';
import { Task } from '../entities/task.entity';

export function isFieldStaffAssignedToTask(userId: string, task: Task, assignees: TaskAssignee[]): boolean {
  return task.assignedUserId === userId || assignees.some((a) => a.userId === userId);
}

export async function findTaskWithLock(
  manager: EntityManager,
  id: string,
  tenantId: string,
  relations: string[] = ['booking', 'processingType', 'assignedUser'],
): Promise<Task> {
  const taskLock = await manager.findOne(Task, {
    where: { id, tenantId },
    lock: { mode: 'pessimistic_write' },
  });

  if (!taskLock) {
    throw new NotFoundException({
      code: 'tasks.not_found_by_id',
      args: { id },
    });
  }

  const task = await manager.findOne(Task, {
    where: { id, tenantId },
    relations,
  });

  if (!task) {
    throw new NotFoundException({
      code: 'tasks.not_found_by_id',
      args: { id },
    });
  }

  return task;
}
