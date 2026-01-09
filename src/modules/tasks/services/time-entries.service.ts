import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import {
  StartTimeEntryDto,
  StopTimeEntryDto,
  UpdateTimeEntryDto,
} from '../dto/time-entry.dto';
import { TimeEntry, TimeEntryStatus } from '../entities/time-entry.entity';

@Injectable()
export class TimeEntriesService {
  constructor(
    @InjectRepository(TimeEntry)
    private readonly timeEntryRepository: Repository<TimeEntry>,
  ) {}

  async startTimer(userId: string, dto: StartTimeEntryDto): Promise<TimeEntry> {
    const tenantId = TenantContextService.getTenantId();

    const activeTimer = await this.timeEntryRepository.findOne({
      where: {
        userId,
        tenantId,
        status: TimeEntryStatus.RUNNING,
      },
    });

    if (activeTimer) {
      throw new BadRequestException(
        'You have an active timer. Please stop it first.',
      );
    }

    const timeEntry = this.timeEntryRepository.create({
      tenantId,
      userId,
      taskId: dto.taskId,
      startTime: new Date(),
      status: TimeEntryStatus.RUNNING,
      billable: dto.billable ?? false,
      notes: dto.notes,
    });

    return this.timeEntryRepository.save(timeEntry);
  }

  async stopTimer(
    userId: string,
    id: string,
    dto?: StopTimeEntryDto,
  ): Promise<TimeEntry> {
    const tenantId = TenantContextService.getTenantId();
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
    const tenantId = TenantContextService.getTenantId();
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
    const tenantId = TenantContextService.getTenantId();
    return this.timeEntryRepository.find({
      where: { taskId, tenantId },
      order: { startTime: 'DESC' },
      relations: ['user'],
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTimeEntryDto,
  ): Promise<TimeEntry> {
    const tenantId = TenantContextService.getTenantId();
    const timeEntry = await this.timeEntryRepository.findOne({
      where: { id, tenantId },
    });

    if (!timeEntry) {
      throw new NotFoundException('Time entry not found');
    }

    Object.assign(timeEntry, dto);

    if (dto.startTime || dto.endTime) {
      if (timeEntry.status === TimeEntryStatus.STOPPED && timeEntry.endTime) {
        timeEntry.durationMinutes = Math.round(
          (new Date(timeEntry.endTime).getTime() -
            new Date(timeEntry.startTime).getTime()) /
            60000,
        );
      }
    }

    return this.timeEntryRepository.save(timeEntry);
  }

  async delete(id: string): Promise<void> {
    const tenantId = TenantContextService.getTenantId();
    const result = await this.timeEntryRepository.delete({ id, tenantId });
    if (result.affected === 0) {
      throw new NotFoundException('Time entry not found');
    }
  }
}
