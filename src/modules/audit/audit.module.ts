import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

import { AuditPublisher } from './audit.publisher';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
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
    {
      provide: AuditPublisher,
      useExisting: AuditService,
    },
  ],
  exports: [AuditService, AuditPublisher],
})
export class AuditModule {}
