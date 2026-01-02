import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Role, TaskStatus } from '../../common/enums';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { Client } from '../bookings/entities/client.entity';
import { FinanceService } from '../finance/services/finance.service';
import { MailService } from '../mail/mail.service';
import { User } from '../users/entities/user.entity';
import { AssignTaskDto, CompleteTaskResponseDto, UpdateTaskDto } from './dto';
import { Task } from './entities/task.entity';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly financeService: FinanceService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(query: PaginationDto = new PaginationDto()): Promise<Task[]> {
    const tenantId = TenantContextService.getTenantId();
    return this.taskRepository.find({
      where: { tenantId },
      relations: ['booking', 'booking.client', 'taskType', 'assignedUser'],
      order: { createdAt: 'DESC' },
      skip: query.getSkip(),
      take: query.getTake(),
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

  async findByBooking(bookingId: string): Promise<Task[]> {
    const tenantId = TenantContextService.getTenantId();
    return this.taskRepository.find({
      where: { bookingId, tenantId },
      relations: ['taskType', 'assignedUser', 'booking', 'booking.client'],
    });
  }

  async findByUser(userId: string): Promise<Task[]> {
    const tenantId = TenantContextService.getTenantId();
    return this.taskRepository.find({
      where: { assignedUserId: userId, tenantId },
      relations: ['booking', 'booking.client', 'taskType'],
      order: { dueDate: 'ASC' },
    });
  }

  async update(id: string, dto: UpdateTaskDto): Promise<Task> {
    const task = await this.findOne(id);

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

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: Acquire lock
      // Note: We MUST NOT include relations here because "FOR UPDATE" cannot be
      // applied to the nullable side of an outer join (which TypeORM uses for relations)
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

      // Step 3: Validate new user belongs to the same tenant (prevent cross-tenant assignment)
      if (dto.userId) {
        const newUser = await queryRunner.manager.findOne(User, {
          where: { id: dto.userId, tenantId },
        });
        if (!newUser) {
          throw new BadRequestException('User not found in tenant');
        }
      }

      task.assignedUserId = dto.userId;

      // Step 4: Update task
      const savedTask = await queryRunner.manager.save(task);

      // Step 5: Commission handling - reverse old, add new
      const commissionAmount = Number(task.commissionSnapshot) || 0;

      // Reverse commission from old user if reassigning
      if (oldUserId && oldUserId !== dto.userId && commissionAmount > 0) {
        await this.financeService.subtractPendingCommission(
          queryRunner.manager,
          oldUserId,
          commissionAmount,
        );
      }

      // Add commission to new user
      if (commissionAmount > 0 && dto.userId) {
        await this.financeService.addPendingCommission(
          queryRunner.manager,
          dto.userId,
          commissionAmount,
        );
      }

      // Step 6: Audit Log
      await this.auditService.log(
        {
          action: 'UPDATE',
          entityName: 'Task',
          entityId: task.id,
          oldValues: { assignedUserId: oldUserId },
          newValues: { assignedUserId: task.assignedUserId },
          notes:
            oldUserId && oldUserId !== dto.userId
              ? `Task reassigned from user ${oldUserId} to ${dto.userId}. Commission reversed and re-credited: ${commissionAmount}`
              : `Task assigned to user ${dto.userId}. Pending commission: ${commissionAmount}`,
        },
        queryRunner.manager,
      );

      // Fetch user details for email
      const emailUser = dto.userId
        ? await queryRunner.manager.findOne(User, {
            where: { id: dto.userId, tenantId },
          })
        : null;

      // Ensure booking and client are loaded for the email
      if (task.booking && !task.booking.client) {
        task.booking.client = (await queryRunner.manager.findOne(Client, {
          where: { id: task.booking.clientId, tenantId },
        })) as Client;
      }

      await queryRunner.commitTransaction();

      // Send email (after commit success)
      if (emailUser && task.taskType && task.booking) {
        this.mailService
          .sendTaskAssignment({
            employeeName: emailUser.email.split('@')[0],
            employeeEmail: emailUser.email,
            taskType: task.taskType.name,
            clientName: task.booking.client?.name || 'Client',
            eventDate: task.booking.eventDate,
            commission: Number(task.commissionSnapshot || 0),
          })
          .catch((err) =>
            this.logger.error(
              `Failed to send task assignment for ${savedTask.id}`,
              err,
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
