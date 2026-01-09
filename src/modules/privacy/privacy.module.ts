import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from '../bookings/entities/booking.entity';
import { Transaction } from '../finance/entities/transaction.entity';
import { Profile } from '../hr/entities/profile.entity';
import { MediaModule } from '../media/media.module';
import { Task } from '../tasks/entities/task.entity';
import { User } from '../users/entities/user.entity';
import { Consent } from './entities/consent.entity';
import { PrivacyRequest } from './entities/privacy-request.entity';
import { ConsentService } from './consent.service';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PrivacyRequest,
      Consent,
      User,
      Booking,
      Task,
      Transaction,
      Profile,
    ]),
    MediaModule,
  ],
  controllers: [PrivacyController],
  providers: [PrivacyService, ConsentService],
  exports: [PrivacyService, ConsentService],
})
export class PrivacyModule {}
