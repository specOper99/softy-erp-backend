import { Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { TENANT_REPO_TASK } from '../../../common/constants/tenant-repo.tokens';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { ExportService } from '../../../common/services/export.service';
import { Task } from '../entities/task.entity';

@Injectable()
export class TasksExportService {
  constructor(
    @Inject(TENANT_REPO_TASK)
    private readonly taskRepository: TenantAwareRepository<Task>,
    private readonly exportService: ExportService,
  ) {}

  async exportToCSV(res: Response): Promise<void> {
    const queryStream = await this.taskRepository
      .createStreamQueryBuilder('task')
      .leftJoinAndSelect('task.booking', 'booking')
      .leftJoinAndSelect('booking.client', 'client')
      .leftJoinAndSelect('task.processingType', 'processingType')
      .leftJoinAndSelect('task.assignedUser', 'assignedUser')
      .orderBy('task.createdAt', 'DESC')
      .stream();

    const fields = [
      'id',
      'status',
      'dueDate',
      'bookingId',
      'clientName',
      'processingType',
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
        processingType: r.processingType_name || '',
        assignedUser: r.assignedUser_email || '',
        commissionSnapshot: r.task_commissionSnapshot || 0,
        notes: r.task_notes || '',
        completedAt: r.task_completedAt ? new Date(r.task_completedAt as string).toISOString() : '',
        createdAt: r.task_createdAt ? new Date(r.task_createdAt as string).toISOString() : '',
      };
    };

    await this.exportService.streamFromStream(
      res,
      queryStream,
      `tasks-export-${new Date().toISOString().split('T')[0]}.csv`,
      fields,
      transformFn,
    );
  }
}
