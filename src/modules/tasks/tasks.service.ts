import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TaskStatus } from '../../common/enums';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { FinanceService } from '../finance/services/finance.service';
import { MailService } from '../mail/mail.service';
import { AssignTaskDto, CompleteTaskResponseDto, UpdateTaskDto } from './dto';
import { Task } from './entities/task.entity';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly financeService: FinanceService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<Task[]> {
    const tenantId = TenantContextService.getTenantId();
    return this.taskRepository.find({
      where: { tenantId },
      relations: ['booking', 'taskType', 'assignedUser'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Task> {
    const tenantId = TenantContextService.getTenantId();
    const task = await this.taskRepository.findOne({
      where: { id, tenantId },
      relations: ['booking', 'taskType', 'assignedUser'],
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
      relations: ['taskType', 'assignedUser'],
    });
  }

  async findByUser(userId: string): Promise<Task[]> {
    const tenantId = TenantContextService.getTenantId();
    return this.taskRepository.find({
      where: { assignedUserId: userId, tenantId },
      relations: ['booking', 'taskType'],
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
    const task = await this.findOne(id);
    const oldUserId = task.assignedUserId;
    task.assignedUserId = dto.userId;
    const savedTask = await this.taskRepository.save(task);

    await this.auditService.log({
      action: 'UPDATE',
      entityName: 'Task',
      entityId: task.id,
      oldValues: { assignedUserId: oldUserId },
      newValues: { assignedUserId: task.assignedUserId },
      notes: 'Task reassigned.',
    });

    // Fetch task details for email
    const fullTask = await this.findOne(savedTask.id);
    if (fullTask.assignedUser && fullTask.taskType && fullTask.booking) {
      this.mailService
        .sendTaskAssignment({
          employeeName: `${fullTask.assignedUser.email.split('@')[0]}`, // Fallback since Profile isn't here
          employeeEmail: fullTask.assignedUser.email,
          taskType: fullTask.taskType.name,
          clientName: fullTask.booking.clientName,
          eventDate: fullTask.booking.eventDate,
          commission: Number(fullTask.commissionSnapshot || 0),
        })
        .catch((err) => console.error('Failed to send assignment email:', err));
    }

    return savedTask;
  }

  async startTask(id: string): Promise<Task> {
    const task = await this.findOne(id);

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
   * 1. Update task status to COMPLETED
   * 2. Set completed_at timestamp
   * 3. Move commission_snapshot to EmployeeWallet.payable_balance
   * 4. Rollback all on failure
   */
  async completeTask(id: string): Promise<CompleteTaskResponseDto> {
    const task = await this.findOne(id);

    if (task.status === TaskStatus.COMPLETED) {
      throw new BadRequestException('Task is already completed');
    }

    if (!task.assignedUserId) {
      throw new BadRequestException('Cannot complete task: no user assigned');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: Update task status to COMPLETED
      const oldStatus = task.status;
      task.status = TaskStatus.COMPLETED;
      task.completedAt = new Date();
      await queryRunner.manager.save(task);

      // Step 2: Move commission to payable balance
      const commissionAmount = Number(task.commissionSnapshot);
      let walletUpdated = false;

      if (commissionAmount > 0) {
        await this.financeService.moveToPayable(
          queryRunner.manager,
          task.assignedUserId,
          commissionAmount,
        );
        walletUpdated = true;
      }

      // Step 3: Audit Log
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
}
