import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformTimeEntryQueryDto, PlatformTimeEntryUpdateDto } from '../dto/platform-time-entries.dto';
import { Task } from '../../tasks/entities/task.entity';
import { TimeEntry, TimeEntryStatus } from '../../tasks/entities/time-entry.entity';
import { PlatformAction } from '../enums/platform-action.enum';
import { PlatformAuditService } from './platform-audit.service';

@Injectable()
export class PlatformTimeEntriesService {
  constructor(
    @InjectRepository(TimeEntry)
    private readonly timeEntryRepository: Repository<TimeEntry>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly auditService: PlatformAuditService,
  ) {}

  async list(tenantId: string, query: PlatformTimeEntryQueryDto): Promise<TimeEntry[]> {
    if (query.taskId) {
      const task = await this.taskRepository.findOne({
        where: { id: query.taskId, tenantId },
      });
      if (!task) {
        throw new NotFoundException('Task not found');
      }
    }

    const qb = this.timeEntryRepository.createQueryBuilder('entry').where('entry.tenantId = :tenantId', { tenantId });

    if (query.userId) {
      qb.andWhere('entry.userId = :userId', { userId: query.userId });
    }

    if (query.taskId) {
      qb.andWhere('entry.taskId = :taskId', { taskId: query.taskId });
    }

    if (query.status) {
      qb.andWhere('entry.status = :status', { status: query.status });
    }

    if (query.from) {
      qb.andWhere('entry.startTime >= :from', { from: new Date(query.from) });
    }

    if (query.to) {
      qb.andWhere('entry.endTime <= :to', { to: new Date(query.to) });
    }

    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;

    qb.orderBy('entry.startTime', 'DESC').skip(offset).take(limit);

    return qb.getMany();
  }

  async findOne(tenantId: string, id: string): Promise<TimeEntry> {
    const entry = await this.timeEntryRepository.findOne({
      where: { id, tenantId },
      relations: ['user', 'task'],
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    return entry;
  }

  async update(
    tenantId: string,
    id: string,
    dto: PlatformTimeEntryUpdateDto,
    platformUserId: string,
    ipAddress: string,
    userAgent?: string,
  ): Promise<TimeEntry> {
    const entry = await this.timeEntryRepository.findOne({
      where: { id, tenantId },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    if (dto.notes !== undefined) {
      entry.notes = dto.notes;
    }

    if (dto.billable !== undefined) {
      entry.billable = dto.billable;
    }

    if (dto.startTime) {
      entry.startTime = new Date(dto.startTime);
    }

    if (dto.endTime) {
      entry.endTime = new Date(dto.endTime);
    }

    if ((dto.startTime || dto.endTime) && entry.status === TimeEntryStatus.STOPPED && entry.endTime) {
      entry.durationMinutes = Math.round((entry.endTime.getTime() - entry.startTime.getTime()) / 60000);
    }

    const saved = await this.timeEntryRepository.save(entry);

    await this.auditService.log({
      platformUserId,
      action: PlatformAction.TIME_ENTRY_UPDATED,
      targetTenantId: tenantId,
      targetEntityType: 'time_entry',
      targetEntityId: id,
      ipAddress,
      userAgent,
    });

    return saved;
  }
}
