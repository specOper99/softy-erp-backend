import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { FinanceModule } from '../finance/finance.module';
import { MailModule } from '../mail/mail.module';
import { ClientPortalModule } from '../client-portal/client-portal.module';
import { BookingsController } from './controllers/bookings.controller';
import { ClientsController } from './controllers/clients.controller';
import { Booking } from './entities/booking.entity';
import { Client } from './entities/client.entity';

import { ExportService } from '../../common/services/export.service';
import { AuditModule } from '../audit/audit.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { TenantsModule } from '../tenants/tenants.module';
import { BookingRepository } from './repositories/booking.repository';
import { ClientRepository } from './repositories/client.repository';
import { BookingExportService } from './services/booking-export.service';
import { BookingStateMachineService } from './services/booking-state-machine.service';
import { BookingWorkflowService } from './services/booking-workflow.service';
import { BookingsService } from './services/bookings.service';
import { ClientsService } from './services/clients.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, Client]),
    forwardRef(() => FinanceModule),
    CatalogModule,
    TenantsModule,
    MailModule,
    AuditModule,
    forwardRef(() => DashboardModule),
    forwardRef(() => ClientPortalModule),
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
