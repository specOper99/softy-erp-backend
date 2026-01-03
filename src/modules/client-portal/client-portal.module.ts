import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from '../bookings/entities/booking.entity';
import { Client } from '../bookings/entities/client.entity';
import { MailModule } from '../mail/mail.module';
import { ClientPortalController } from './client-portal.controller';
import { ClientAuthService } from './services/client-auth.service';

@Module({
  imports: [TypeOrmModule.forFeature([Client, Booking]), MailModule],
  controllers: [ClientPortalController],
  providers: [ClientAuthService],
  exports: [ClientAuthService],
})
export class ClientPortalModule {}
