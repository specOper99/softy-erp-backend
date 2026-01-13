import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { ExportService } from '../../../common/services/export.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { Task } from '../entities/task.entity';

@Injectable()
export class TasksExportService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly exportService: ExportService,
  ) {}

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
        dueDate: r.task_dueDate ? new Date(r.task_dueDate as string).toISOString() : '',
        bookingId: r.task_bookingId || '',
        clientName: r.client_name || '',
        taskType: r.taskType_name || '',
        assignedUser: r.assignedUser_email || '',
        commissionSnapshot: r.task_commissionSnapshot || 0,
        notes: r.task_notes || '',
        completedAt: r.task_completedAt ? new Date(r.task_completedAt as string).toISOString() : '',
        createdAt: r.task_createdAt ? new Date(r.task_createdAt as string).toISOString() : '',
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
}
