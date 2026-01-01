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

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, ServicePackage, Client]),
    FinanceModule,
    MailModule,
  ],
  controllers: [BookingsController, ClientsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
