import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { DataSource, Repository } from 'typeorm';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ExportService } from '../../../common/services/export.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { AuditService } from '../../audit/audit.service';
import { Client } from '../../bookings/entities/client.entity';
import { FinanceService } from '../../finance/services/finance.service';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import { AssignTaskDto, CompleteTaskResponseDto, UpdateTaskDto } from '../dto';
import { Task } from '../entities/task.entity';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskAssignedEvent } from '../events/task-assigned.event';
import { TaskCompletedEvent } from '../events/task-completed.event';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly financeService: FinanceService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    private readonly eventBus: EventBus,
    private readonly exportService: ExportService,
  ) {}

  async findAll(query: PaginationDto = new PaginationDto()): Promise<Task[]> {
    const tenantId = TenantContextService.getTenantId();
    const qb = this.taskRepository.createQueryBuilder('task');

    qb.leftJoinAndSelect('task.booking', 'booking')
      .leftJoinAndSelect('booking.client', 'client')
      .leftJoinAndSelect('task.taskType', 'taskType')
      .leftJoinAndSelect('task.assignedUser', 'assignedUser')
      .where('task.tenantId = :tenantId', { tenantId })
      .orderBy('task.createdAt', 'DESC')
      .skip(query.getSkip())
      .take(query.getTake());

    return qb.getMany();
  }

  async findAllCursor(
    query: CursorPaginationDto,
  ): Promise<{ data: Task[]; nextCursor: string | null }> {
    const tenantId = TenantContextService.getTenantId();

    const qb = this.taskRepository.createQueryBuilder('task');

    qb.leftJoinAndSelect('task.booking', 'booking')
      .leftJoinAndSelect('booking.client', 'client')
      .leftJoinAndSelect('task.taskType', 'taskType')
      .leftJoinAndSelect('task.assignedUser', 'assignedUser')
      .where('task.tenantId = :tenantId', { tenantId });

    return CursorPaginationHelper.paginate(qb, {
      cursor: query.cursor,
      limit: query.limit,
      alias: 'task',
    });
  }

  async findOne(id: string): Promise<Task> {
    const tenantId = TenantContextService.getTenantId();
    const task = await this.taskRepository.findOne({
      where: { id, tenantId },
      relations: ['booking', 'booking.client', 'taskType', 'assignedUser'],
    });
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return task;
  }

  async findByBooking(bookingId: string, limit = 100): Promise<Task[]> {
    const tenantId = TenantContextService.getTenantId();
    return this.taskRepository.find({
      where: { bookingId, tenantId },
      relations: ['taskType', 'assignedUser', 'booking', 'booking.client'],
      take: limit,
    });
  }

  async findByUser(userId: string, limit = 100): Promise<Task[]> {
    const tenantId = TenantContextService.getTenantId();
    return this.taskRepository.find({
      where: { assignedUserId: userId, tenantId },
      relations: ['booking', 'booking.client', 'taskType'],
      order: { dueDate: 'ASC' },
      take: limit,
    });
  }

  async exportToCSV(res: Response): Promise<void> {
    const tenantId = TenantContextService.getTenantId();

    const queryStream = await this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.booking', 'booking')
      .leftJoinAndSelect('booking.client', 'client')
      .leftJoinAndSelect('task.taskType', 'taskType')
      .leftJoinAndSelect('task.assignedUser', 'assignedUser')
      .where('task.tenantId = :tenantId', { tenantId })
      .orderBy('task.createdAt', 'DESC')
      .stream();

    const fields = [
      'id',
      'status',
      'dueDate',
      'bookingId',
      'clientName',
      'taskType',
      'assignedUser',
      'commissionSnapshot',
      'notes',
      'completedAt',
      'createdAt',
    ];

    const transformFn = (row: unknown) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.task_id,
        status: r.task_status,
        dueDate: r.task_dueDate
          ? new Date(r.task_dueDate as string).toISOString()
          : '',
        bookingId: r.task_bookingId || '',
        clientName: r.client_name || '',
        taskType: r.taskType_name || '',
        assignedUser: r.assignedUser_email || '',
        commissionSnapshot: r.task_commissionSnapshot || 0,
        notes: r.task_notes || '',
        completedAt: r.task_completedAt
          ? new Date(r.task_completedAt as string).toISOString()
          : '',
        createdAt: r.task_createdAt
          ? new Date(r.task_createdAt as string).toISOString()
          : '',
      };
    };

    this.exportService.streamFromStream(
      res,
      queryStream,
      `tasks-export-${new Date().toISOString().split('T')[0]}.csv`,
      fields,
      transformFn,
    );
  }

  async update(id: string, dto: UpdateTaskDto): Promise<Task> {
    const task = await this.findOne(id);

    // Validate parentId to prevent circular dependencies or self-reference
    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new BadRequestException('A task cannot be its own parent');
      }
      if (dto.parentId) {
        const tenantId = TenantContextService.getTenantId();
        const parent = await this.taskRepository.findOne({
          where: { id: dto.parentId, tenantId },
        });
        if (!parent) {
          throw new NotFoundException(
            `Parent task with ID ${dto.parentId} not found`,
          );
        }
      }
    }

    if (dto.dueDate) {
      task.dueDate = new Date(dto.dueDate);
    }

    Object.assign(task, {
      ...dto,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : task.dueDate,
    });

    return this.taskRepository.save(task);
  }

  async assignTask(id: string, dto: AssignTaskDto): Promise<Task> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: Acquire lock (without relations due to FOR UPDATE limitation)
      const taskLock = await queryRunner.manager.findOne(Task, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!taskLock) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      // Step 2: Fetch actual data with relations
      const task = await queryRunner.manager.findOne(Task, {
        where: { id, tenantId },
        relations: ['booking', 'taskType', 'assignedUser'],
      });

      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      const oldUserId = task.assignedUserId;

      // Step 3: Validate new user belongs to the same tenant
      const assignedUser = await this.validateUserInTenant(
        queryRunner.manager,
        dto.userId,
        tenantId,
      );

      task.assignedUserId = dto.userId;

      // Step 4: Update task
      const savedTask = await queryRunner.manager.save(task);

      // Step 5: Handle commission transfers
      const commissionAmount = Number(task.commissionSnapshot) || 0;
      await this.handleCommissionTransfer(
        queryRunner.manager,
        oldUserId,
        dto.userId,
        commissionAmount,
      );

      // Step 6: Audit Log
      await this.logTaskAssignment(
        queryRunner.manager,
        task,
        oldUserId,
        dto.userId,
        commissionAmount,
      );

      // Ensure booking.client is loaded for the email
      await this.ensureClientLoaded(queryRunner.manager, task, tenantId);

      await queryRunner.commitTransaction();

      // Emit domain event (after commit)
      if (assignedUser && task.taskType && task.booking) {
        this.eventBus.publish(
          new TaskAssignedEvent(
            task.id,
            tenantId,
            assignedUser.email.split('@')[0], // name approximation or real name if available? Helper used email split.
            assignedUser.email,
            task.taskType.name,
            task.booking.client?.name || 'Client',
            task.booking.eventDate,
            commissionAmount,
          ),
        );
      }

      return savedTask;
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
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

  private async handleCommissionTransfer(
    manager: import('typeorm').EntityManager,
    oldUserId: string | null,
    newUserId: string | undefined,
    commissionAmount: number,
  ): Promise<void> {
    if (commissionAmount <= 0) return;

    // Fix: Deadlock Prevention.
    // We must acquire locks on the wallets in a deterministic order.
    // We'll create a list of updates to perform, sort them by userId, and execute.

    interface WalletUpdate {
      userId: string;
      action: 'subtract' | 'add';
    }

    const updates: WalletUpdate[] = [];

    if (oldUserId && oldUserId !== newUserId) {
      updates.push({ userId: oldUserId, action: 'subtract' });
    }

    if (newUserId) {
      updates.push({ userId: newUserId, action: 'add' });
    }

    // Sort by userId to ensure deterministic locking order
    updates.sort((a, b) => a.userId.localeCompare(b.userId));

    // Execute updates in order
    for (const update of updates) {
      if (update.action === 'subtract') {
        await this.financeService.subtractPendingCommission(
          manager,
          update.userId,
          commissionAmount,
        );
      } else {
        await this.financeService.addPendingCommission(
          manager,
          update.userId,
          commissionAmount,
        );
      }
    }
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

    await this.auditService.log(
      {
        action: 'UPDATE',
        entityName: 'Task',
        entityId: task.id,
        oldValues: { assignedUserId: oldUserId },
        newValues: { assignedUserId: task.assignedUserId },
        notes,
      },
      manager,
    );
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
        throw new NotFoundException(
          `Action Interrupted: Client data is missing for Booking ${task.bookingId}`,
        );
      }
      task.booking.client = client;
    }
  }

  async startTask(id: string, user: User): Promise<Task> {
    const task = await this.findOne(id);

    this.assertCanUpdateTaskStatus(user, task);

    if (task.status !== TaskStatus.PENDING) {
      throw new BadRequestException(
        `Cannot start task: current status is ${task.status}`,
      );
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
    const tenantId = TenantContextService.getTenantId();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: Acquire pessimistic lock to prevent race conditions
      // Step 1: Acquire pessimistic lock to prevent race conditions
      // Note: We MUST NOT include relations here because "FOR UPDATE" cannot be
      // applied to the nullable side of an outer join (which TypeORM uses for relations)
      const taskLock = await queryRunner.manager.findOne(Task, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!taskLock) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      // Step 2: Fetch actual data with relations now that we have the lock
      const task = await queryRunner.manager.findOne(Task, {
        where: { id, tenantId },
        relations: ['booking', 'taskType', 'assignedUser'],
      });

      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

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
      await queryRunner.manager.save(task);

      // Step 3: Move commission to payable balance (NaN-safe)
      const commissionAmount = Number(task.commissionSnapshot) || 0;
      let walletUpdated = false;

      if (commissionAmount > 0) {
        await this.financeService.moveToPayable(
          queryRunner.manager,
          task.assignedUserId,
          commissionAmount,
        );
        walletUpdated = true;
      }

      // Step 4: Audit Log
      await this.auditService.log(
        {
          action: 'STATUS_CHANGE',
          entityName: 'Task',
          entityId: task.id,
          oldValues: { status: oldStatus },
          newValues: { status: TaskStatus.COMPLETED },
          notes: `Task completed. Commission of ${commissionAmount} accrued.`,
        },
        queryRunner.manager,
      );

      // Commit transaction
      await queryRunner.commitTransaction();

      // Emit domain event
      const userId = task.assignedUserId;
      if (userId) {
        this.eventBus.publish(
          new TaskCompletedEvent(
            task.id,
            tenantId || '', // Fallback or strict check needed. Assuming tenantId is available here.
            task.completedAt || new Date(),
            commissionAmount,
            userId,
          ),
        );
      }

      return {
        task,
        commissionAccrued: commissionAmount,
        walletUpdated,
      };
    } catch (error) {
      // Rollback on failure
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
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
}
