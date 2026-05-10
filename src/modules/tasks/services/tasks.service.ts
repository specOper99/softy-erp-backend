import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { parseISO } from 'date-fns';
import type { Response } from 'express';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { createPaginatedResponse, PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { applyIlikeSearch } from '../../../common/utils/ilike-escape.util';
import { MathUtils } from '../../../common/utils/math.utils';
import { TenantScopedManager } from '../../../common/utils/tenant-scoped-manager';
import { AuditService } from '../../audit/audit.service';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { WalletService } from '../../finance/services/wallet.service';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import { CompleteTaskResponseDto, TaskFilterDto, UpdateTaskDto } from '../dto';
import { TaskAssignee } from '../entities/task-assignee.entity';
import { Task } from '../entities/task.entity';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskCompletedEvent } from '../events/task-completed.event';
import { TasksExportService } from './tasks-export.service';

import { TaskAssigneeRepository } from '../repositories/task-assignee.repository';
import { TaskRepository } from '../repositories/task.repository';

@Injectable()
export class TasksService {
  private readonly tenantTx: TenantScopedManager;

  private static readonly MAX_LIST_LIMIT = 100;
  private static readonly DEFAULT_LIST_LIMIT = 100;

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly walletService: WalletService,
    private readonly auditService: AuditService,
    dataSource: DataSource,
    private readonly eventBus: EventBus,
    private readonly tasksExportService: TasksExportService,
    private readonly taskAssigneeRepository: TaskAssigneeRepository,
  ) {
    this.tenantTx = new TenantScopedManager(dataSource);
  }

  async findAll(query: PaginationDto = new PaginationDto()): Promise<Task[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const qb = this.createTaskBaseQuery(tenantId);

    qb.orderBy('task.createdAt', 'DESC').skip(query.getSkip()).take(query.getTake());

    return qb.getMany();
  }

  async findAllWithFilters(filter: TaskFilterDto): Promise<PaginatedResponseDto<Task>> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const qb = this.createTaskBaseQuery(tenantId);

    // Apply filters
    this.applyTaskFilters(qb, filter);

    // Get total count
    const total = await qb.getCount();

    // Apply pagination
    qb.skip(filter.getSkip()).take(filter.getTake());

    // Order by
    qb.orderBy('task.dueDate', 'ASC').addOrderBy('task.createdAt', 'DESC');

    const data = await qb.getMany();

    return createPaginatedResponse(data, total, filter.page || 1, filter.getTake());
  }

  async findAllWithFiltersCursor(filter: TaskFilterDto): Promise<{ data: Task[]; nextCursor: string | null }> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const qb = this.createTaskBaseQuery(tenantId);

    // Apply cursor pagination with filters
    return CursorPaginationHelper.paginate(qb, {
      cursor: filter.cursor,
      limit: filter.limit,
      alias: 'task',
      filters: (qb) => this.applyTaskFilters(qb, filter),
    });
  }

  private applyTaskFilters(qb: SelectQueryBuilder<Task>, filter: TaskFilterDto): void {
    if (filter.status) {
      qb.andWhere('task.status = :status', { status: filter.status });
    }

    if (filter.assignedUserId) {
      qb.andWhere('task.assignedUserId = :assignedUserId', { assignedUserId: filter.assignedUserId });
    }

    if (filter.bookingId) {
      qb.andWhere('task.bookingId = :bookingId', { bookingId: filter.bookingId });
    }

    if (filter.taskTypeId) {
      qb.andWhere('task.taskTypeId = :taskTypeId', { taskTypeId: filter.taskTypeId });
    }

    if (filter.dueDateStart && filter.dueDateEnd) {
      qb.andWhere('task.dueDate BETWEEN :start AND :end', {
        start: parseISO(filter.dueDateStart),
        end: parseISO(filter.dueDateEnd),
      });
    } else if (filter.dueDateStart) {
      qb.andWhere('task.dueDate >= :start', { start: parseISO(filter.dueDateStart) });
    } else if (filter.dueDateEnd) {
      qb.andWhere('task.dueDate <= :end', { end: parseISO(filter.dueDateEnd) });
    }

    if (filter.search) {
      applyIlikeSearch(qb, ['task.notes', 'taskType.name'], filter.search);
    }
  }

  async findAllCursor(query: CursorPaginationDto): Promise<{ data: Task[]; nextCursor: string | null }> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const qb = this.createTaskBaseQuery(tenantId);

    return CursorPaginationHelper.paginate(qb, {
      cursor: query.cursor,
      limit: query.limit,
      alias: 'task',
    });
  }

  async findOne(id: string): Promise<Task> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const task = await this.taskRepository.findOne({
      where: { id, tenantId },
      relations: ['booking', 'booking.client', 'taskType', 'assignedUser'],
    });
    if (!task) {
      throw new NotFoundException({
        code: 'tasks.not_found_by_id',
        args: { id },
      });
    }
    return task;
  }

  async findByBooking(bookingId: string, limit = 100): Promise<Task[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const take = this.normalizeListLimit(limit);
    return this.taskRepository.find({
      where: { bookingId, tenantId },
      relations: ['taskType', 'assignedUser', 'booking', 'booking.client'],
      take,
    });
  }

  async findByUser(userId: string, limit = 100): Promise<Task[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const take = this.normalizeListLimit(limit);
    return this.taskRepository.find({
      where: { assignedUserId: userId, tenantId },
      relations: ['booking', 'booking.client', 'taskType'],
      order: { dueDate: 'ASC' },
      take,
    });
  }

  private normalizeListLimit(limit: number | undefined): number {
    const candidate =
      typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : TasksService.DEFAULT_LIST_LIMIT;
    return Math.max(1, Math.min(TasksService.MAX_LIST_LIMIT, candidate));
  }

  async exportToCSV(res: Response): Promise<void> {
    return this.tasksExportService.exportToCSV(res);
  }

  async update(id: string, dto: UpdateTaskDto): Promise<Task> {
    const task = await this.findOne(id);

    // Validate parentId to prevent circular dependencies or self-reference
    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new BadRequestException('tasks.cannot_be_own_parent');
      }
      if (dto.parentId) {
        const parent = await this.taskRepository.findOne({
          where: { id: dto.parentId },
        });
        if (!parent) {
          throw new NotFoundException({
            code: 'tasks.parent_not_found',
            args: { id: dto.parentId },
          });
        }
      }
    }

    if (dto.dueDate) {
      task.dueDate = new Date(dto.dueDate);
    }

    if (dto.assignedUserId !== undefined && dto.assignedUserId !== task.assignedUserId) {
      throw new BadRequestException('tasks.reassignment_use_assign');
    }

    // Guard against unauthorized status changes
    if ('status' in dto) {
      throw new BadRequestException('tasks.status_use_endpoints');
    }
    if (dto.dueDate !== undefined) task.dueDate = new Date(dto.dueDate);
    if (dto.notes !== undefined) task.notes = dto.notes;
    if (dto.parentId !== undefined) task.parentId = dto.parentId;

    return this.taskRepository.save(task);
  }

  async startTask(id: string, user: User): Promise<Task> {
    const task = await this.findOne(id);

    this.assertCanUpdateTaskStatus(user, task);

    if (task.status !== TaskStatus.PENDING) {
      throw new BadRequestException({
        code: 'tasks.cannot_start_status',
        args: { status: task.status },
      });
    }

    task.status = TaskStatus.IN_PROGRESS;
    const savedTask = await this.taskRepository.save(task);

    await this.auditService.log({
      action: 'STATUS_CHANGE',
      entityName: 'Task',
      entityId: task.id,
      oldValues: { status: TaskStatus.PENDING },
      newValues: { status: TaskStatus.IN_PROGRESS },
    });

    return savedTask;
  }

  /**
   * WORKFLOW 2: Task Completion
   * Transactional steps:
   * 1. Acquire pessimistic lock on task
   * 2. Update task status to COMPLETED
   * 3. Set completed_at timestamp
   * 4. Move commission_snapshot to EmployeeWallet.payable_balance
   * 5. Rollback all on failure
   */
  async completeTask(id: string, user: User): Promise<CompleteTaskResponseDto> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const result = await this.tenantTx.run(async (manager) => {
      // Step 1: Acquire pessimistic lock to prevent race conditions
      // Note: We MUST NOT include relations here because "FOR UPDATE" cannot be
      // applied to the nullable side of an outer join (which TypeORM uses for relations)
      const task = await this.findTaskWithLock(manager, id, tenantId);

      const taskAssignees = await manager.find(TaskAssignee, {
        where: { tenantId, taskId: task.id },
      });

      const canFieldStaffComplete =
        user.role !== Role.FIELD_STAFF || this.isFieldStaffAssignedToTask(user.id, task, taskAssignees);

      if (!canFieldStaffComplete) {
        throw new ForbiddenException('tasks.modify_forbidden');
      }

      if (user.role !== Role.FIELD_STAFF) {
        this.assertCanUpdateTaskStatus(user, task);
      }

      if (task.status === TaskStatus.COMPLETED) {
        throw new BadRequestException('tasks.already_completed');
      }

      if (task.booking?.status === BookingStatus.CANCELLED) {
        throw new BadRequestException('tasks.booking_cancelled');
      }

      // Step 2: Update task status to COMPLETED
      const oldStatus = task.status;
      task.status = TaskStatus.COMPLETED;
      task.completedAt = new Date();
      await manager.save(task);

      // Step 3: Move commission to payable balance (NaN-safe)
      let commissionAmount = 0;
      let walletUpdated = false;

      if (taskAssignees.length > 0) {
        for (const assignee of taskAssignees) {
          const assigneeCommission = MathUtils.round(Number(assignee.commissionSnapshot) || 0);
          if (assigneeCommission <= 0) {
            continue;
          }

          await this.walletService.moveToPayable(manager, assignee.userId, assigneeCommission);
          commissionAmount = MathUtils.add(commissionAmount, assigneeCommission);
          walletUpdated = true;
        }
      } else {
        if (!task.assignedUserId) {
          throw new BadRequestException('tasks.complete_no_assignee');
        }

        const legacyCommissionAmount = MathUtils.round(Number(task.commissionSnapshot) || 0);
        if (legacyCommissionAmount > 0) {
          // Legacy path: commission was never added to pendingBalance, so add directly to payable
          await this.walletService.addToPayableBalance(manager, task.assignedUserId, legacyCommissionAmount);
          commissionAmount = legacyCommissionAmount;
          walletUpdated = true;
        }
      }

      // Step 4: Audit Log
      await this.auditService.log({
        action: 'STATUS_CHANGE',
        entityName: 'Task',
        entityId: task.id,
        oldValues: { status: oldStatus },
        newValues: { status: TaskStatus.COMPLETED },
        notes: `Task completed. Commission of ${commissionAmount} accrued.`,
      });

      return { task, commissionAmount, walletUpdated };
    });

    // Emit domain event (after commit)
    const userId = result.task.assignedUserId;
    if (userId) {
      this.eventBus.publish(
        new TaskCompletedEvent(
          result.task.id,
          tenantId || '',
          result.task.completedAt || new Date(),
          result.commissionAmount,
          userId,
        ),
      );
    }

    return {
      task: result.task,
      commissionAccrued: result.commissionAmount,
      walletUpdated: result.walletUpdated,
    };
  }

  private assertCanUpdateTaskStatus(user: User, task: Task): void {
    if (!user) {
      throw new ForbiddenException('common.user_context_required');
    }

    if (user.role === Role.ADMIN || user.role === Role.OPS_MANAGER) {
      return;
    }

    if (user.role === Role.FIELD_STAFF) {
      if (!task.assignedUserId) {
        throw new ForbiddenException('tasks.not_assigned');
      }
      if (task.assignedUserId !== user.id) {
        throw new ForbiddenException('tasks.modify_forbidden');
      }
      return;
    }

    throw new ForbiddenException('common.not_allowed');
  }

  /**
   * Returns true if the given user (FIELD_STAFF) is assigned to the task either
   * via the direct `assignedUserId` field or via the many-to-many `task_assignees` table.
   * Consolidates the two historically duplicated checks into one place.
   */
  private isFieldStaffAssignedToTask(userId: string, task: Task, assignees: TaskAssignee[]): boolean {
    return task.assignedUserId === userId || assignees.some((a) => a.userId === userId);
  }

  private createTaskBaseQuery(tenantId: string) {
    return this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.booking', 'booking', 'booking.tenantId = :tenantId', { tenantId })
      .leftJoinAndSelect('booking.client', 'client', 'client.tenantId = :tenantId', { tenantId })
      .leftJoinAndSelect('task.taskType', 'taskType', 'taskType.tenantId = :tenantId', { tenantId })
      .leftJoinAndSelect('task.assignedUser', 'assignedUser', 'assignedUser.tenantId = :tenantId', { tenantId })
      .andWhere('task.tenantId = :tenantId', { tenantId });
  }

  private async findTaskWithLock(
    manager: import('typeorm').EntityManager,
    id: string,
    tenantId: string,
    relations: string[] = ['booking', 'taskType', 'assignedUser'],
  ): Promise<Task> {
    // Step 1: Acquire pessimistic lock (without relations due to FOR UPDATE limitation)
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

    // Step 2: Fetch actual data with relations
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
