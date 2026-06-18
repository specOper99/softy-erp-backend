import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TENANT_REPO_TIME_ENTRY } from '../../../common/constants/tenant-repo.tokens';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import { StartTimeEntryDto, StopTimeEntryDto, UpdateTimeEntryDto } from '../dto/time-entry.dto';
import { Task } from '../entities/task.entity';
import { TimeEntry, TimeEntryStatus } from '../entities/time-entry.entity';

@Injectable()
export class TimeEntriesService {
  constructor(
    @Inject(TENANT_REPO_TIME_ENTRY)
    private readonly timeEntryRepository: TenantAwareRepository<TimeEntry>,
    private readonly dataSource: DataSource,
  ) {}

  async startTimer(userId: string, dto: StartTimeEntryDto): Promise<TimeEntry> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    return this.dataSource.transaction(async (manager) => {
      const activeTimer = await manager
        .createQueryBuilder(TimeEntry, 'entry')
        .where('entry.userId = :userId', { userId })
        .andWhere('entry.tenantId = :tenantId', { tenantId })
        .andWhere('entry.status = :status', { status: TimeEntryStatus.RUNNING })
        .setLock('pessimistic_write')
        .getOne();

      if (activeTimer) {
        throw new BadRequestException('time_entries.active_timer');
      }

      const task = await manager.findOne(Task, {
        where: { id: dto.taskId, tenantId },
      });
      if (!task) {
        throw new NotFoundException('task.not_found_plain');
      }

      const timeEntry = manager.create(TimeEntry, {
        tenantId,
        userId,
        taskId: dto.taskId,
        startTime: new Date(),
        status: TimeEntryStatus.RUNNING,
        billable: dto.billable ?? false,
        notes: dto.notes,
        latitude: dto.latitude,
        longitude: dto.longitude,
      });

      return manager.save(timeEntry);
    });
  }

  async stopTimer(userId: string, id: string, dto?: StopTimeEntryDto): Promise<TimeEntry> {
    const timeEntry = await this.timeEntryRepository.findOne({
      where: { id, userId },
    });

    if (!timeEntry) {
      throw new NotFoundException('time_entries.not_found');
    }

    if (timeEntry.status !== TimeEntryStatus.RUNNING) {
      throw new BadRequestException('time_entries.timer_not_running');
    }

    if (dto?.notes) {
      timeEntry.notes = dto.notes;
    }

    if (dto?.latitude !== undefined) {
      timeEntry.latitude = dto.latitude;
    }

    if (dto?.longitude !== undefined) {
      timeEntry.longitude = dto.longitude;
    }

    timeEntry.stop(dto?.endTime ? new Date(dto.endTime) : undefined);
    return this.timeEntryRepository.save(timeEntry);
  }

  async getActiveTimer(userId: string): Promise<TimeEntry | null> {
    return this.timeEntryRepository.findOne({
      where: {
        userId,
        status: TimeEntryStatus.RUNNING,
      },
      relations: ['task'],
    });
  }

  async getTaskTimeEntries(taskId: string): Promise<TimeEntry[]> {
    return this.timeEntryRepository.find({
      where: { taskId },
      order: { startTime: 'DESC' },
      relations: ['user'],
      take: 1000,
    });
  }

  async update(user: User, id: string, dto: UpdateTimeEntryDto): Promise<TimeEntry> {
    const isAdmin = user.role === Role.ADMIN || user.role === Role.OPS_MANAGER;
    const timeEntry = await this.timeEntryRepository.findOne({
      where: { id },
    });

    if (!timeEntry) {
      throw new NotFoundException('time_entries.not_found');
    }

    if (!isAdmin && timeEntry.userId !== user.id) {
      throw new ForbiddenException('time_entries.update_forbidden');
    }

    if (dto.startTime !== undefined) timeEntry.startTime = new Date(dto.startTime);
    if (dto.endTime !== undefined) timeEntry.endTime = new Date(dto.endTime);
    if (dto.notes !== undefined) timeEntry.notes = dto.notes;
    if (dto.billable !== undefined) timeEntry.billable = dto.billable;

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
    const result = await this.timeEntryRepository.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundException('time_entries.not_found');
    }
  }
}
