import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { FinanceModule } from '../finance/finance.module';
import { MailModule } from '../mail/mail.module';
import { BookingsController } from './controllers/bookings.controller';
import { ClientsController } from './controllers/clients.controller';
import { Booking } from './entities/booking.entity';
import { Client } from './entities/client.entity';

import { ExportService } from '../../common/services/export.service';
import { AuditModule } from '../audit/audit.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { TenantsModule } from '../tenants/tenants.module';
import { BookingStateMachineService } from './services/booking-state-machine.service';
import { BookingWorkflowService } from './services/booking-workflow.service';
import { BookingsService } from './services/bookings.service';
import { ClientsService } from './services/clients.service';
import { BookingExportService } from './services/booking-export.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, Client]),
    FinanceModule,
    CatalogModule,
    TenantsModule,
    MailModule,
    AuditModule,
    DashboardModule,
  ],
  controllers: [BookingsController, ClientsController],
  providers: [
    BookingsService,
    BookingWorkflowService,
    BookingStateMachineService,
    ClientsService,
    BookingExportService,
    ExportService,
  ],
  exports: [
    BookingsService,
    BookingStateMachineService,
    ClientsService,
    BookingExportService,
  ],
})
export class BookingsModule {}
