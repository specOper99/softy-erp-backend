import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-yet';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');

        // If Redis URL is configured, use Redis
        if (redisUrl) {
          return {
            store: await redisStore({
              url: redisUrl,
              ttl: 60000, // 60 seconds default TTL
            }),
          };
        }

        // Fallback to in-memory cache
        return {
          ttl: 60000, // 60 seconds
          max: 100, // Maximum 100 items
        };
      },
    }),
  ],
  exports: [CacheModule],
})
export class AppCacheModule {}
