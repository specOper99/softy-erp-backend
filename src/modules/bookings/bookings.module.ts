import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { OutboxEvent } from '../../common/entities/outbox-event.entity';
import { CatalogModule } from '../catalog/catalog.module';
import { ServicePackage } from '../catalog/domain/entities/service-package.entity';
import { ClientsModule } from '../clients/clients.module';
import { FinanceModule } from '../finance/finance.module';
import { ProcessingTypeEligibility } from '../hr/domain/entities/processing-type-eligibility.entity';
import { StaffAvailabilitySlot } from '../hr/domain/entities/staff-availability-slot.entity';
import { ProcessingTypeEligibilityRepository } from '../hr/infrastructure/processing-type-eligibility.repository';
import { StaffAvailabilitySlotRepository } from '../hr/infrastructure/staff-availability-slot.repository';
import { MailModule } from '../mail/mail.module';
import { MetricsModule } from '../metrics/metrics.module';
import { TaskAssignee } from '../tasks/domain/entities/task-assignee.entity';
import { Task } from '../tasks/domain/entities/task.entity';
import { TaskAssigneeRepository } from '../tasks/infrastructure/task-assignee.repository';
import { User } from '../users/domain/entities/user.entity';
import { UserRepository } from '../users/infrastructure/user.repository';
import { BookingIntakeController } from './api/booking-intake.controller';
import { BookingsController } from './api/bookings.controller';
import { ProcessingTypesController } from './api/processing-types.controller';
import { Booking } from './domain/entities/booking.entity';
import { ProcessingType } from './domain/entities/processing-type.entity';

import { ExportService } from '../../common/services/export.service';
import { AuditModule } from '../audit/audit.module';
import { TasksModule } from '../tasks/tasks.module';
import { TenantsModule } from '../tenants/tenants.module';
import { BookingCompletionHandler } from './infrastructure/booking-completion.handler';
import { BookingRepository } from './infrastructure/booking.repository';
import { ProcessingTypeRepository } from './infrastructure/processing-type.repository';
import { BookingExportService } from './application/booking-export.service';
import { BookingFinanceEffectsService } from './application/booking-finance-effects.service';
import { BookingIntakeService } from './application/booking-intake.service';
import { BookingStateMachineService } from './application/booking-state-machine.service';
import { BookingTaskSpawnService } from './application/booking-task-spawn.service';
import { BookingWorkflowService } from './application/booking-workflow.service';
import { BookingsPaymentsService } from './application/bookings-payments.service';
import { BookingsPricingService } from './application/bookings-pricing.service';
import { BookingsService } from './application/bookings.service';
import { ProcessingTypeService } from './application/processing-type.service';
import { StaffConflictService } from './application/staff-conflict.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
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
    forwardRef(() => ClientsModule),
  ],
  controllers: [BookingsController, BookingIntakeController, ProcessingTypesController],
  providers: [
    BookingsService,
    BookingsPaymentsService,
    BookingsPricingService,
    BookingWorkflowService,
    BookingFinanceEffectsService,
    BookingTaskSpawnService,
    BookingStateMachineService,
    BookingExportService,
    ExportService,
    BookingRepository,
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
    BookingExportService,
    BookingRepository,
    ProcessingTypeService,
    StaffConflictService,
  ],
})
export class BookingsModule {}
