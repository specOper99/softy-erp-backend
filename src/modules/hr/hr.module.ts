import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeWallet } from '../finance/entities/employee-wallet.entity';
import { FinanceModule } from '../finance/finance.module';
import { MailModule } from '../mail/mail.module';
import { Profile } from './entities/profile.entity';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Profile, EmployeeWallet]),
    FinanceModule,
    MailModule,
  ],
  controllers: [HrController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}
