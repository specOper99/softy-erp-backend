import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { OutboxEvent } from '../../common/entities/outbox-event.entity';
import { CatalogModule } from '../catalog/catalog.module';
import { ServicePackage } from '../catalog/entities/service-package.entity';
import { FinanceModule } from '../finance/finance.module';
import { ProcessingTypeEligibility } from '../hr/entities/processing-type-eligibility.entity';
import { StaffAvailabilitySlot } from '../hr/entities/staff-availability-slot.entity';
import { ProcessingTypeEligibilityRepository } from '../hr/repositories/processing-type-eligibility.repository';
import { StaffAvailabilitySlotRepository } from '../hr/repositories/staff-availability-slot.repository';
import { MailModule } from '../mail/mail.module';
import { MetricsModule } from '../metrics/metrics.module';
import { TaskAssignee } from '../tasks/entities/task-assignee.entity';
import { Task } from '../tasks/entities/task.entity';
import { TaskAssigneeRepository } from '../tasks/repositories/task-assignee.repository';
import { User } from '../users/entities/user.entity';
import { UserRepository } from '../users/repositories/user.repository';
import { BookingIntakeController } from './controllers/booking-intake.controller';
import { BookingsController } from './controllers/bookings.controller';
import { ClientsController } from './controllers/clients.controller';
import { ProcessingTypesController } from './controllers/processing-types.controller';
import { Booking } from './entities/booking.entity';
import { Client } from './entities/client.entity';
import { ProcessingType } from './entities/processing-type.entity';

import { ExportService } from '../../common/services/export.service';
import { AuditModule } from '../audit/audit.module';
import { TasksModule } from '../tasks/tasks.module';
import { TenantsModule } from '../tenants/tenants.module';
import { BookingCompletionHandler } from './handlers/booking-completion.handler';
import { BookingRepository } from './repositories/booking.repository';
import { ClientRepository } from './repositories/client.repository';
import { ProcessingTypeRepository } from './repositories/processing-type.repository';
import { BookingExportService } from './services/booking-export.service';
import { BookingIntakeService } from './services/booking-intake.service';
import { BookingStateMachineService } from './services/booking-state-machine.service';
import { BookingWorkflowService } from './services/booking-workflow.service';
import { BookingsPaymentsService } from './services/bookings-payments.service';
import { BookingsPricingService } from './services/bookings-pricing.service';
import { BookingsService } from './services/bookings.service';
import { ClientsService } from './services/clients.service';
import { ProcessingTypeService } from './services/processing-type.service';
import { StaffConflictService } from './services/staff-conflict.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      Client,
      ServicePackage,
      ProcessingTypeEligibility,
      StaffAvailabilitySlot,
      User,
      TaskAssignee,
      Task,
      ProcessingType,
      OutboxEvent,
    ]),
    CommonModule,
    FinanceModule,
    CatalogModule,
    MetricsModule,
    TenantsModule,
    MailModule,
    AuditModule,
    TasksModule,
  ],
  controllers: [BookingsController, BookingIntakeController, ClientsController, ProcessingTypesController],
  providers: [
    BookingsService,
    BookingsPaymentsService,
    BookingsPricingService,
    BookingWorkflowService,
    BookingStateMachineService,
    ClientsService,
    BookingExportService,
    ExportService,
    BookingRepository,
    ClientRepository,
    ProcessingTypeRepository,
    UserRepository,
    TaskAssigneeRepository,
    ProcessingTypeEligibilityRepository,
    StaffAvailabilitySlotRepository,
    StaffConflictService,
    BookingCompletionHandler,
    ProcessingTypeService,
    BookingIntakeService,
  ],
  exports: [
    BookingsService,
    BookingsPaymentsService,
    BookingWorkflowService,
    BookingStateMachineService,
    ClientsService,
    BookingExportService,
    BookingRepository,
    ClientRepository,
    ProcessingTypeService,
    StaffConflictService,
  ],
})
export class BookingsModule {}
