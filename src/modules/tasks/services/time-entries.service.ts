import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import { StartTimeEntryDto, StopTimeEntryDto, UpdateTimeEntryDto } from '../dto/time-entry.dto';
import { Task } from '../entities/task.entity';
import { TimeEntry, TimeEntryStatus } from '../entities/time-entry.entity';

@Injectable()
export class TimeEntriesService {
  constructor(
    @InjectRepository(TimeEntry)
    private readonly timeEntryRepository: Repository<TimeEntry>,
    private readonly dataSource: DataSource,
  ) {}

  async startTimer(userId: string, dto: StartTimeEntryDto): Promise<TimeEntry> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    // [C-05] Race Condition Fix: Use pessimistic locking to prevent concurrent timer starts
    return this.dataSource.transaction(async (manager) => {
      // Acquire exclusive lock on existing running timer (if any)
      const activeTimer = await manager
        .createQueryBuilder(TimeEntry, 'entry')
        .where('entry.userId = :userId', { userId })
        .andWhere('entry.tenantId = :tenantId', { tenantId })
        .andWhere('entry.status = :status', { status: TimeEntryStatus.RUNNING })
        .setLock('pessimistic_write')
        .getOne();

      if (activeTimer) {
        throw new BadRequestException('You have an active timer. Please stop it first.');
      }

      const task = await manager.findOne(Task, {
        where: { id: dto.taskId, tenantId },
      });
      if (!task) {
        throw new NotFoundException('Task not found');
      }

      const timeEntry = manager.create(TimeEntry, {
        tenantId,
        userId,
        taskId: dto.taskId,
        startTime: new Date(),
        status: TimeEntryStatus.RUNNING,
        billable: dto.billable ?? false,
        notes: dto.notes,
      });

      return manager.save(timeEntry);
    });
  }

  async stopTimer(userId: string, id: string, dto?: StopTimeEntryDto): Promise<TimeEntry> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const timeEntry = await this.timeEntryRepository.findOne({
      where: { id, userId, tenantId },
    });

    if (!timeEntry) {
      throw new NotFoundException('Time entry not found');
    }

    if (timeEntry.status !== TimeEntryStatus.RUNNING) {
      throw new BadRequestException('Timer is not running');
    }

    if (dto?.notes) {
      timeEntry.notes = dto.notes;
    }

    timeEntry.stop(dto?.endTime ? new Date(dto.endTime) : undefined);
    return this.timeEntryRepository.save(timeEntry);
  }

  async getActiveTimer(userId: string): Promise<TimeEntry | null> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.timeEntryRepository.findOne({
      where: {
        userId,
        tenantId,
        status: TimeEntryStatus.RUNNING,
      },
      relations: ['task'],
    });
  }

  async getTaskTimeEntries(taskId: string): Promise<TimeEntry[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.timeEntryRepository.find({
      where: { taskId, tenantId },
      order: { startTime: 'DESC' },
      relations: ['user'],
      take: 1000, // [Safety] Prevent unbounded result set
    });
  }

  async update(user: User, id: string, dto: UpdateTimeEntryDto): Promise<TimeEntry> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const isAdmin = user.role === Role.ADMIN || user.role === Role.OPS_MANAGER;
    const timeEntry = await this.timeEntryRepository.findOne({
      where: { id, tenantId },
    });

    if (!timeEntry) {
      throw new NotFoundException('Time entry not found');
    }

    if (!isAdmin && timeEntry.userId !== user.id) {
      throw new ForbiddenException('Not allowed to update this time entry');
    }

    Object.assign(timeEntry, dto);

    if (dto.startTime || dto.endTime) {
      if (timeEntry.status === TimeEntryStatus.STOPPED && timeEntry.endTime) {
        timeEntry.durationMinutes = Math.round(
          (new Date(timeEntry.endTime).getTime() - new Date(timeEntry.startTime).getTime()) / 60000,
        );
      }
    }

    return this.timeEntryRepository.save(timeEntry);
  }

  async delete(id: string): Promise<void> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const result = await this.timeEntryRepository.delete({ id, tenantId });
    if (result.affected === 0) {
      throw new NotFoundException('Time entry not found');
    }
  }
}
