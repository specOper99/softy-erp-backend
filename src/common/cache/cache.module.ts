import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-yet';
import { AvailabilityCacheOwnerService } from './availability-cache-owner.service';
import { CacheUtilsService } from './cache-utils.service';
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
            ttl: 60 * 1000, // 60 seconds default TTL (in ms)
            store: await redisStore({
              url: redisUrl,
              ttl: 60 * 1000,
            }),
          };
        }

        // Fallback to in-memory cache
        return {
          ttl: 60 * 1000, // 60 seconds (in ms)
          max: 100, // Maximum 100 items
        };
      },
    }),
  ],
  providers: [CacheUtilsService, AvailabilityCacheOwnerService],
  exports: [CacheModule, CacheUtilsService, AvailabilityCacheOwnerService],
})
export class AppCacheModule {}
