import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { areBackgroundJobsEnabled } from './background-jobs.runtime';
import { RuntimeFailure } from '../errors/runtime-failure';

const backgroundJobsEnabled = areBackgroundJobsEnabled();

/**
 * Global Queue module for background job processing using BullMQ.
 * Provides Redis-backed queues for async work like email sending and webhook delivery.
 */
@Global()
@Module({
  imports: backgroundJobsEnabled
    ? [
        BullModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => {
            const redisUrl = configService.get<string>('REDIS_URL');
            if (!redisUrl) {
              throw new RuntimeFailure(
                'REDIS_URL is required when ENABLE_BACKGROUND_JOBS is not false. Set ENABLE_BACKGROUND_JOBS=false to boot without queues.',
              );
            }

            const url = new URL(redisUrl);
            return {
              connection: {
                host: url.hostname,
                port: parseInt(url.port, 10) || 9379,
                password: url.password || undefined,
                username: url.username || undefined,
              },
            };
          },
        }),
      ]
    : [],
  exports: backgroundJobsEnabled ? [BullModule] : [],
})
export class QueueModule {}
