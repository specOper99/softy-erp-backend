import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceModule } from '../finance/finance.module';
import { MailModule } from '../mail/mail.module';
import { TasksController } from './controllers/tasks.controller';
import { TimeEntriesController } from './controllers/time-entries.controller';
import { Task, TaskAssignee, TaskTemplate, TimeEntry } from './entities';
import { TasksExportService } from './services/tasks-export.service';
import { TasksService } from './services/tasks.service';
import { TimeEntriesService } from './services/time-entries.service';

import { ExportService } from '../../common/services/export.service';

import { TaskAssigneeRepository } from './repositories/task-assignee.repository';
import { TaskRepository } from './repositories/task.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Task, TaskAssignee, TaskTemplate, TimeEntry]), FinanceModule, MailModule],
  controllers: [TasksController, TimeEntriesController],
  providers: [
    TasksService,
    ExportService,
    TimeEntriesService,
    TasksExportService,
    TaskRepository,
    TaskAssigneeRepository,
  ],
  exports: [TasksService, TimeEntriesService, TasksExportService, TaskRepository, TaskAssigneeRepository],
})
export class TasksModule {}
