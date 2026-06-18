import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TENANT_REPO_TASK, TENANT_REPO_TIME_ENTRY } from '../../common/constants/tenant-repo.tokens';
import { TenantAwareRepository } from '../../common/repositories/tenant-aware.repository';
import { FinanceModule } from '../finance/finance.module';
import { MailModule } from '../mail/mail.module';
import { TasksController } from './controllers/tasks.controller';
import { TimeEntriesController } from './controllers/time-entries.controller';
import { Task, TaskAssignee, TaskTemplate, TimeEntry } from './entities';
import { TaskAssigneeService } from './services/task-assignee.service';
import { TasksExportService } from './services/tasks-export.service';
import { TasksService } from './services/tasks.service';
import { TimeEntriesService } from './services/time-entries.service';

import { ExportService } from '../../common/services/export.service';

import { TaskAssigneeRepository } from './repositories/task-assignee.repository';
import { TaskRepository } from './repositories/task.repository';
import { TimeEntryRepository } from './repositories/time-entry.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Task, TaskAssignee, TaskTemplate, TimeEntry]), FinanceModule, MailModule],
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
