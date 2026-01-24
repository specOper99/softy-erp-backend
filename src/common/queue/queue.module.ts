import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Global Queue module for background job processing using BullMQ.
 * Provides Redis-backed queues for async work like email sending and webhook delivery.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        if (!redisUrl) {
          // Return default config for testing/development without Redis
          return {
            connection: {
              host: 'localhost',
              port: 9379,
            },
          };
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
  ],
  exports: [BullModule],
})
export class QueueModule {}
