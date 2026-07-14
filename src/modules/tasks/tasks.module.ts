import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TENANT_REPO_TASK, TENANT_REPO_TIME_ENTRY } from '../../common/constants/tenant-repo.tokens';
import { OutboxEvent } from '../../common/entities/outbox-event.entity';
import { TenantAwareRepository } from '../../common/repositories/tenant-aware.repository';
import { FinanceModule } from '../finance/finance.module';
import { MailModule } from '../mail/mail.module';
import { TasksController } from './api/tasks.controller';
import { TimeEntriesController } from './api/time-entries.controller';
import { TaskAssigneeService } from './application/task-assignee.service';
import { TasksExportService } from './application/tasks-export.service';
import { TasksService } from './application/tasks.service';
import { TimeEntriesService } from './application/time-entries.service';
import { Task, TaskAssignee, TaskTemplate, TimeEntry } from './domain/entities';

import { ExportService } from '../../common/services/export.service';

import { TaskAssigneeRepository } from './infrastructure/task-assignee.repository';
import { TaskRepository } from './infrastructure/task.repository';
import { TimeEntryRepository } from './infrastructure/time-entry.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, TaskAssignee, TaskTemplate, TimeEntry, OutboxEvent]),
    FinanceModule,
    MailModule,
  ],
  controllers: [TasksController, TimeEntriesController],
  providers: [
    TasksService,
    TaskAssigneeService,
    ExportService,
    TimeEntriesService,
    TasksExportService,
    TaskRepository,
    TaskAssigneeRepository,
    TimeEntryRepository,
    {
      provide: TENANT_REPO_TASK,
      useFactory: (repo: Repository<Task>) => new TenantAwareRepository(repo),
      inject: [getRepositoryToken(Task)],
    },
    {
      provide: TENANT_REPO_TIME_ENTRY,
      useFactory: (repo: Repository<TimeEntry>) => new TenantAwareRepository(repo),
      inject: [getRepositoryToken(TimeEntry)],
    },
  ],
  exports: [
    TasksService,
    TaskAssigneeService,
    TimeEntriesService,
    TasksExportService,
    TaskRepository,
    TaskAssigneeRepository,
    TimeEntryRepository,
  ],
})
export class TasksModule {}
