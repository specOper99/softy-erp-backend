import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetricsModule } from '../metrics/metrics.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

import { AuditPublisher } from './audit.publisher';
import { AuditLogRepository } from './repositories/audit-log.repository';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    MetricsModule,
    BullModule.registerQueue({
      name: 'audit-queue',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
      },
    }),
  ],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditLogRepository,
    {
      provide: AuditPublisher,
      useExisting: AuditService,
    },
  ],
  exports: [AuditService, AuditPublisher],
})
export class AuditModule {}
