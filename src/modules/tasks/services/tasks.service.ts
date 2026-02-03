import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import type { Response } from 'express';
import { Brackets, DataSource, SelectQueryBuilder } from 'typeorm';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { createPaginatedResponse, PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { MathUtils } from '../../../common/utils/math.utils';
import { TenantScopedManager } from '../../../common/utils/tenant-scoped-manager';
import { AuditService } from '../../audit/audit.service';
import { Client } from '../../bookings/entities/client.entity';
import { FinanceService } from '../../finance/services/finance.service';
import { WalletService } from '../../finance/services/wallet.service';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import { AssignTaskDto, CompleteTaskResponseDto, TaskFilterDto, UpdateTaskDto } from '../dto';
import { Task } from '../entities/task.entity';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskAssignedEvent } from '../events/task-assigned.event';
import { TaskCompletedEvent } from '../events/task-completed.event';
import { TasksExportService } from './tasks-export.service';

import { TaskRepository } from '../repositories/task.repository';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private readonly tenantTx: TenantScopedManager;

  private static readonly MAX_LIST_LIMIT = 100;
  private static readonly DEFAULT_LIST_LIMIT = 100;

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly financeService: FinanceService,
    private readonly walletService: WalletService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    private readonly eventBus: EventBus,
    private readonly tasksExportService: TasksExportService,
  ) {
    this.tenantTx = new TenantScopedManager(dataSource);
  }

  async findAll(query: PaginationDto = new PaginationDto()): Promise<Task[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const qb = this.createTaskBaseQuery(tenantId);

    qb.orderBy('task.createdAt', 'DESC').skip(query.getSkip()).take(query.getTake());

    return qb.getMany();
  }

  /**
   * @deprecated Use findAllWithFiltersCursor for better performance with large datasets
   */
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
        start: new Date(filter.dueDateStart),
        end: new Date(filter.dueDateEnd),
      });
    } else if (filter.dueDateStart) {
      qb.andWhere('task.dueDate >= :start', { start: new Date(filter.dueDateStart) });
    } else if (filter.dueDateEnd) {
      qb.andWhere('task.dueDate <= :end', { end: new Date(filter.dueDateEnd) });
    }

    if (filter.search) {
      qb.andWhere(
        new Brackets((qb2) => {
          qb2
            .where('task.notes ILIKE :search', { search: `%${filter.search}%` })
            .orWhere('taskType.name ILIKE :search', { search: `%${filter.search}%` });
        }),
      );
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
    const task = await this.taskRepository.findOne({
      where: { id },
      relations: ['booking', 'booking.client', 'taskType', 'assignedUser'],
    });
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return task;
  }

  async findByBooking(bookingId: string, limit = 100): Promise<Task[]> {
    const take = this.normalizeListLimit(limit);
    return this.taskRepository.find({
      where: { bookingId },
      relations: ['taskType', 'assignedUser', 'booking', 'booking.client'],
      take,
    });
  }

  async findByUser(userId: string, limit = 100): Promise<Task[]> {
    const take = this.normalizeListLimit(limit);
    return this.taskRepository.find({
      where: { assignedUserId: userId },
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
        throw new BadRequestException('A task cannot be its own parent');
      }
      if (dto.parentId) {
        const parent = await this.taskRepository.findOne({
          where: { id: dto.parentId },
        });
        if (!parent) {
          throw new NotFoundException(`Parent task with ID ${dto.parentId} not found`);
        }
      }
    }

    if (dto.dueDate) {
      task.dueDate = new Date(dto.dueDate);
    }

    if (dto.assignedUserId !== undefined && dto.assignedUserId !== task.assignedUserId) {
      throw new BadRequestException('Task reassignment must use the assign endpoint');
    }

    // Guard against unauthorized status changes
    if ('status' in dto) {
      throw new BadRequestException('Status updates must use dedicated endpoints (start/complete)');
    }
    Object.assign(task, {
      ...dto,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : task.dueDate,
    });

    return this.taskRepository.save(task);
  }

  async assignTask(id: string, dto: AssignTaskDto): Promise<Task> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const result = await this.tenantTx.run(async (manager) => {
      const task = await this.findTaskWithLock(manager, id, tenantId);

      const oldUserId = task.assignedUserId;

      // Step 3: Validate new user belongs to the same tenant
      const assignedUser = await this.validateUserInTenant(manager, dto.userId, tenantId);

      task.assignedUserId = dto.userId;

      // Step 4: Update task
      const savedTask = await manager.save(task);

      // Step 5: Handle commission transfers
      const commissionAmount = MathUtils.round(Number(task.commissionSnapshot) || 0);
      await this.financeService.transferPendingCommission(manager, oldUserId, dto.userId, commissionAmount);

      // Step 6: Audit Log
      await this.logTaskAssignment(manager, task, oldUserId, dto.userId, commissionAmount);

      // Ensure booking.client is loaded for the email
      await this.ensureClientLoaded(manager, task, tenantId);

      return { savedTask, assignedUser, commissionAmount };
    });

    // Emit domain event (after commit)
    if (result.assignedUser && result.savedTask.taskType && result.savedTask.booking) {
      this.eventBus.publish(
        new TaskAssignedEvent(
          result.savedTask.id,
          tenantId,
          result.assignedUser.email,
          result.assignedUser.email,
          result.savedTask.taskType.name,
          result.savedTask.booking.client?.name || 'Client',
          result.savedTask.booking.eventDate,
          result.commissionAmount,
        ),
      );
    }

    return result.savedTask;
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
      throw new BadRequestException('User not found in tenant');
    }
    return user;
  }

  private async logTaskAssignment(
    manager: import('typeorm').EntityManager,
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
        throw new NotFoundException(`Action Interrupted: Client data is missing for Booking ${task.bookingId}`);
      }
      task.booking.client = client;
    }
  }

  async startTask(id: string, user: User): Promise<Task> {
    const task = await this.findOne(id);

    this.assertCanUpdateTaskStatus(user, task);

    if (task.status !== TaskStatus.PENDING) {
      throw new BadRequestException(`Cannot start task: current status is ${task.status}`);
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

      this.assertCanUpdateTaskStatus(user, task);

      if (task.status === TaskStatus.COMPLETED) {
        throw new BadRequestException('Task is already completed');
      }

      if (!task.assignedUserId) {
        throw new BadRequestException('Cannot complete task: no user assigned');
      }

      // Step 2: Update task status to COMPLETED
      const oldStatus = task.status;
      task.status = TaskStatus.COMPLETED;
      task.completedAt = new Date();
      await manager.save(task);

      // Step 3: Move commission to payable balance (NaN-safe)
      const commissionAmount = MathUtils.round(Number(task.commissionSnapshot) || 0);
      let walletUpdated = false;

      if (commissionAmount > 0) {
        await this.walletService.moveToPayable(manager, task.assignedUserId, commissionAmount);
        walletUpdated = true;
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
      throw new ForbiddenException('User context is required');
    }

    if (user.role === Role.ADMIN || user.role === Role.OPS_MANAGER) {
      return;
    }

    if (user.role === Role.FIELD_STAFF) {
      if (!task.assignedUserId) {
        throw new ForbiddenException('Task is not assigned');
      }
      if (task.assignedUserId !== user.id) {
        throw new ForbiddenException('Not allowed to modify this task');
      }
      return;
    }

    throw new ForbiddenException('Not allowed');
  }

  private createTaskBaseQuery(tenantId: string) {
    return this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.booking', 'booking')
      .leftJoinAndSelect('booking.client', 'client')
      .leftJoinAndSelect('task.taskType', 'taskType')
      .leftJoinAndSelect('task.assignedUser', 'assignedUser')
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
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // Step 2: Fetch actual data with relations
    const task = await manager.findOne(Task, {
      where: { id, tenantId },
      relations,
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return task;
  }
}
