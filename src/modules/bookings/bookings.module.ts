import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { PackageItem } from '../catalog/entities/package-item.entity';
import { ServicePackage } from '../catalog/entities/service-package.entity';
import { FinanceModule } from '../finance/finance.module';
import { TaskTypeEligibility } from '../hr/entities/task-type-eligibility.entity';
import { TaskTypeEligibilityRepository } from '../hr/repositories/task-type-eligibility.repository';
import { MailModule } from '../mail/mail.module';
import { TaskAssignee } from '../tasks/entities/task-assignee.entity';
import { Task } from '../tasks/entities/task.entity';
import { TaskAssigneeRepository } from '../tasks/repositories/task-assignee.repository';
import { User } from '../users/entities/user.entity';
import { UserRepository } from '../users/repositories/user.repository';
import { BookingsController } from './controllers/bookings.controller';
import { ClientsController } from './controllers/clients.controller';
import { Booking } from './entities/booking.entity';
import { Client } from './entities/client.entity';

import { ExportService } from '../../common/services/export.service';
import { AuditModule } from '../audit/audit.module';
import { TasksModule } from '../tasks/tasks.module';
import { TenantsModule } from '../tenants/tenants.module';
import { BookingCompletionHandler } from './handlers/booking-completion.handler';
import { BookingRepository } from './repositories/booking.repository';
import { ClientRepository } from './repositories/client.repository';
import { BookingExportService } from './services/booking-export.service';
import { BookingStateMachineService } from './services/booking-state-machine.service';
import { BookingWorkflowService } from './services/booking-workflow.service';
import { BookingsService } from './services/bookings.service';
import { ClientsService } from './services/clients.service';
import { StaffConflictService } from './services/staff-conflict.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      Client,
      ServicePackage,
      PackageItem,
      TaskTypeEligibility,
      User,
      TaskAssignee,
      Task,
    ]),
    FinanceModule,
    CatalogModule,
    TenantsModule,
    MailModule,
    AuditModule,
    TasksModule,
  ],
  controllers: [BookingsController, ClientsController],
  providers: [
    BookingsService,
    BookingWorkflowService,
    BookingStateMachineService,
    ClientsService,
    BookingExportService,
    ExportService,
    BookingRepository,
    ClientRepository,
    UserRepository,
    TaskAssigneeRepository,
    TaskTypeEligibilityRepository,
    StaffConflictService,
    BookingCompletionHandler,
  ],
  exports: [
    BookingsService,
    BookingStateMachineService,
    ClientsService,
    BookingExportService,
    BookingRepository,
    ClientRepository,
  ],
})
export class BookingsModule {}
