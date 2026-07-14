import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { areBackgroundJobsEnabled } from '../../common/queue/background-jobs.runtime';
import { MetricsModule } from '../metrics/metrics.module';
import { AuditController } from './api/audit.controller';
import { AuditPublisher } from './application/audit.publisher';
import { AuditService } from './application/audit.service';
import { AuditLog } from './domain/entities';
import { AuditLogRepository } from './infrastructure/audit-log.repository';
import { AuditProcessor } from './infrastructure/audit.processor';

const backgroundJobsEnabled = areBackgroundJobsEnabled();

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    MetricsModule,
    ...(backgroundJobsEnabled
      ? [
          BullModule.registerQueue({
            name: 'audit-queue',
          }),
        ]
      : []),
  ],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditLogRepository,
    ...(backgroundJobsEnabled ? [AuditProcessor] : []),
    {
      provide: AuditPublisher,
      useExisting: AuditService,
    },
  ],
  exports: [AuditService, AuditPublisher],
})
export class AuditModule {}
