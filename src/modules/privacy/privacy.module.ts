import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingsModule } from '../bookings/bookings.module';
import { FinanceModule } from '../finance/finance.module';
import { HrModule } from '../hr/hr.module';
import { MediaModule } from '../media/media.module';
import { TasksModule } from '../tasks/tasks.module';
import { UsersModule } from '../users/users.module';
import { Consent } from './entities/consent.entity';
import { PrivacyRequest } from './entities/privacy-request.entity';
import { ConsentService } from './consent.service';
import { PrivacyController } from './privacy.controller';
import { PrivacyRequestRepository } from './repositories/privacy-request.repository';
import { PrivacyService } from './privacy.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PrivacyRequest, Consent]),
    UsersModule,
    BookingsModule,
    TasksModule,
    FinanceModule,
    HrModule,
    MediaModule,
  ],
  controllers: [PrivacyController],
  providers: [PrivacyService, ConsentService, PrivacyRequestRepository],
  exports: [PrivacyService, ConsentService],
})
export class PrivacyModule {}
