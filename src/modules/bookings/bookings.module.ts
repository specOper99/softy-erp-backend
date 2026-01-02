import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServicePackage } from '../catalog/entities/service-package.entity';
import { FinanceModule } from '../finance/finance.module';
import { MailModule } from '../mail/mail.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { ClientsController } from './clients.controller';
import { Booking } from './entities/booking.entity';
import { Client } from './entities/client.entity';

import { AuditModule } from '../audit/audit.module';
import { BookingWorkflowService } from './services/booking-workflow.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, ServicePackage, Client]),
    FinanceModule,
    MailModule,
    AuditModule,
  ],
  controllers: [BookingsController, ClientsController],
  providers: [BookingsService, BookingWorkflowService],
  exports: [BookingsService],
})
export class BookingsModule {}
