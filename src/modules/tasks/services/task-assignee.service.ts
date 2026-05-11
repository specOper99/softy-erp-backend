import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { MathUtils } from '../../../common/utils/math.utils';
import { TenantScopedManager } from '../../../common/utils/tenant-scoped-manager';
import { AuditService } from '../../audit/audit.service';
import { Client } from '../../bookings/entities/client.entity';
import { FinanceService } from '../../finance/services/finance.service';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import { AddTaskAssigneeDto, AssignTaskDto, UpdateTaskAssigneeDto } from '../dto';
import { TaskAssignee } from '../entities/task-assignee.entity';
import { Task } from '../entities/task.entity';
import { TaskAssigneeRole } from '../enums/task-assignee-role.enum';
import { TaskAssignedEvent } from '../events/task-assigned.event';
import { TaskAssigneeRepository } from '../repositories/task-assignee.repository';
import { TaskRepository } from '../repositories/task.repository';

@Injectable()
export class TaskAssigneeService {
  private readonly tenantTx: TenantScopedManager;

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly taskAssigneeRepository: TaskAssigneeRepository,
    private readonly financeService: FinanceService,
    private readonly auditService: AuditService,
    private readonly eventBus: EventBus,
    dataSource: DataSource,
  ) {
    this.tenantTx = new TenantScopedManager(dataSource);
  }

  async assignTask(id: string, dto: AssignTaskDto): Promise<Task> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const result = await this.tenantTx.run(async (manager) => {
      const task = await this.findTaskWithLock(manager, id, tenantId);

      const oldUserId = task.assignedUserId;

      const assignedUser = await this.validateUserInTenant(manager, dto.userId, tenantId);

      task.assignedUserId = dto.userId;

      const savedTask = await manager.save(task);

      const commissionAmount = MathUtils.round(Number(task.commissionSnapshot) || 0);
      await this.financeService.transferPendingCommission(manager, oldUserId, dto.userId, commissionAmount);

      await this.logTaskAssignment(task, oldUserId, dto.userId, commissionAmount);

      await this.ensureClientLoaded(manager, task, tenantId);

      return { savedTask, assignedUser, commissionAmount };
    });

    if (result.assignedUser && result.savedTask.processingType && result.savedTask.booking) {
      this.eventBus.publish(
        new TaskAssignedEvent(
          result.savedTask.id,
          tenantId,
          result.assignedUser.email,
          result.assignedUser.email,
          result.savedTask.processingType.name,
          result.savedTask.booking.client?.name || 'Client',
          result.savedTask.booking.eventDate,
          result.commissionAmount,
        ),
      );
    }

    return result.savedTask;
  }

  async addTaskAssignee(id: string, dto: AddTaskAssigneeDto): Promise<TaskAssignee> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    return this.tenantTx.run(async (manager) => {
      const task = await this.findTaskWithLock(manager, id, tenantId);
      await this.validateUserInTenant(manager, dto.userId, tenantId);

      const commissionAmount = MathUtils.round(Number(dto.commissionSnapshot ?? task.commissionSnapshot) || 0);
      if (commissionAmount <= 0) {
        throw new BadRequestException('tasks.commission_snapshot_positive');
      }

      const role = dto.role ?? TaskAssigneeRole.ASSISTANT;

      if (role === TaskAssigneeRole.LEAD) {
        await manager
          .createQueryBuilder()
          .update(TaskAssignee)
          .set({ role: TaskAssigneeRole.ASSISTANT })
          .where('tenant_id = :tenantId', { tenantId })
          .andWhere('task_id = :taskId', { taskId: id })
          .andWhere('role = :leadRole', { leadRole: TaskAssigneeRole.LEAD })
          .andWhere('user_id != :userId', { userId: dto.userId })
          .execute();
      }

      const assignee = manager.create(TaskAssignee, {
        tenantId,
        taskId: id,
        userId: dto.userId,
        role,
        commissionSnapshot: commissionAmount,
      });

      let savedAssignee: TaskAssignee;
      try {
        savedAssignee = await manager.save(assignee);
      } catch (error) {
        if ((error as { code?: string })?.code === '23505') {
          throw new ConflictException('tasks.assignee_already_exists');
        }
        throw error;
      }

      await this.financeService.transferPendingCommission(manager, null, dto.userId, commissionAmount);
      await this.syncLegacyAssignedUserIdWithLead(manager, task, tenantId);

      return savedAssignee;
    });
  }

  async updateTaskAssignee(id: string, userId: string, dto: UpdateTaskAssigneeDto): Promise<TaskAssignee> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    return this.tenantTx.run(async (manager) => {
      const task = await this.findTaskWithLock(manager, id, tenantId);

      const assignee = await manager.findOne(TaskAssignee, {
        where: { tenantId, taskId: id, userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!assignee) {
        throw new NotFoundException({
          code: 'tasks.assignee_not_found_for_user',
          args: { userId },
        });
      }

      if (dto.role === TaskAssigneeRole.LEAD) {
        await manager.update(
          TaskAssignee,
          { tenantId, taskId: id, role: TaskAssigneeRole.LEAD },
          { role: TaskAssigneeRole.ASSISTANT },
        );
      }

      assignee.role = dto.role;
      const updated = await manager.save(assignee);

      await this.syncLegacyAssignedUserIdWithLead(manager, task, tenantId);

      return updated;
    });
  }

  async removeTaskAssignee(id: string, userId: string): Promise<void> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    await this.tenantTx.run(async (manager) => {
      const task = await this.findTaskWithLock(manager, id, tenantId);

      const assignee = await manager.findOne(TaskAssignee, {
        where: { tenantId, taskId: id, userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!assignee) {
        throw new NotFoundException({
          code: 'tasks.assignee_not_found_for_user',
          args: { userId },
        });
      }

      const commissionAmount = MathUtils.round(Number(assignee.commissionSnapshot) || 0);
      if (commissionAmount <= 0) {
        throw new BadRequestException('tasks.commission_snapshot_positive');
      }

      await manager.delete(TaskAssignee, { tenantId, taskId: id, userId });
      await this.financeService.transferPendingCommission(manager, userId, undefined, commissionAmount);
      await this.syncLegacyAssignedUserIdWithLead(manager, task, tenantId);
    });
  }

  async listTaskAssignees(id: string, user: User): Promise<TaskAssignee[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const task = await this.taskRepository.findOne({ where: { id, tenantId } });
    if (!task) {
      throw new NotFoundException({
        code: 'tasks.not_found_by_id',
        args: { id },
      });
    }

    const assignees = await this.taskAssigneeRepository.find({
      where: { tenantId, taskId: id },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });

    if (user.role === Role.FIELD_STAFF && !this.isFieldStaffAssignedToTask(user.id, task, assignees)) {
      throw new ForbiddenException('tasks.assignees_forbidden');
    }

    return assignees;
  }

  private async validateUserInTenant(
    manager: import('typeorm').EntityManager,
    userId: string | undefined,
    tenantId: string,
  ): Promise<User | null> {
    if (!userId) return null;
    const user = await manager.findOne(User, {
      where: { id: userId, tenantId },
    });
    if (!user) {
      throw new BadRequestException('hr.user_not_found_in_tenant');
    }
    return user;
  }

  private async logTaskAssignment(
    task: Task,
    oldUserId: string | null,
    newUserId: string | undefined,
    commissionAmount: number,
  ): Promise<void> {
    const isReassignment = oldUserId && oldUserId !== newUserId;
    const notes = isReassignment
      ? `Task reassigned from user ${oldUserId} to ${newUserId}. Commission reversed and re-credited: ${commissionAmount}`
      : `Task assigned to user ${newUserId}. Pending commission: ${commissionAmount}`;

    await this.auditService.log({
      action: 'UPDATE',
      entityName: 'Task',
      entityId: task.id,
      oldValues: { assignedUserId: oldUserId },
      newValues: { assignedUserId: task.assignedUserId },
      notes,
    });
  }

  private async ensureClientLoaded(
    manager: import('typeorm').EntityManager,
    task: Task,
    tenantId: string,
  ): Promise<void> {
    if (task.booking && !task.booking.client) {
      const client = await manager.findOne(Client, {
        where: { id: task.booking.clientId, tenantId },
      });
      if (!client) {
        throw new NotFoundException({
          code: 'tasks.client_data_missing',
          args: { bookingId: task.bookingId },
        });
      }
      task.booking.client = client;
    }
  }

  private async syncLegacyAssignedUserIdWithLead(
    manager: import('typeorm').EntityManager,
    task: Task,
    tenantId: string,
  ): Promise<void> {
    const leadAssignee = await manager.findOne(TaskAssignee, {
      where: { tenantId, taskId: task.id, role: TaskAssigneeRole.LEAD },
      order: { createdAt: 'ASC' },
    });

    const nextAssignedUserId = leadAssignee?.userId ?? null;
    if (task.assignedUserId !== nextAssignedUserId) {
      task.assignedUserId = nextAssignedUserId;
      await manager.save(task);
    }
  }

  private isFieldStaffAssignedToTask(userId: string, task: Task, assignees: TaskAssignee[]): boolean {
    return task.assignedUserId === userId || assignees.some((a) => a.userId === userId);
  }

  private async findTaskWithLock(
    manager: import('typeorm').EntityManager,
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
}
