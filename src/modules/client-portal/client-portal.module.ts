import {
  CallHandler,
  ExecutionContext,
  Injectable,
  MiddlewareConsumer,
  Module,
  NestModule,
  type NestInterceptor,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Observable, Subscription } from 'rxjs';
import { Repository } from 'typeorm';
import { TENANT_REPO_CLIENT } from '../../common/constants/tenant-repo.tokens';
import { TenantAwareRepository } from '../../common/repositories/tenant-aware.repository';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { getAllowedJwtAlgorithm } from '../../common/utils/jwt-algorithm.util';
import { BookingsModule } from '../bookings/bookings.module';
import { Booking } from '../bookings/entities/booking.entity';
import { Client } from '../bookings/entities/client.entity';
import { CatalogModule } from '../catalog/catalog.module';
import { ServicePackage } from '../catalog/entities/service-package.entity';
import { MailModule } from '../mail/mail.module';
import { MetricsModule } from '../metrics/metrics.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { Tenant } from '../tenants/entities/tenant.entity';
import { TenantsModule } from '../tenants/tenants.module';
import { ClientPortalController } from './client-portal.controller';
import { ValidateTenantSlugMiddleware } from './decorators/validate-tenant-slug.decorator';
import { ClientTokenGuard } from './guards/client-token.guard';
import { AvailabilityService } from './services/availability.service';
import { ClientAuthService } from './services/client-auth.service';
import { ClientPortalService } from './services/client-portal.service';

@Injectable()
class ClientPortalTenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { client?: Client }>();
    const tenantId = request.client?.tenantId;

    if (!tenantId) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      let innerSubscription: Subscription | undefined;

      TenantContextService.run(tenantId, () => {
        innerSubscription = next.handle().subscribe(subscriber);
      });

      return () => {
        innerSubscription?.unsubscribe();
      };
    });
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Client, Booking, Tenant, ServicePackage]),
    BookingsModule,
    MailModule,
    MetricsModule,
    TenantsModule,
    ConfigModule,
    CatalogModule,
    ReviewsModule,
    NotificationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const algorithm = getAllowedJwtAlgorithm(configService);
        if (algorithm === 'RS256') {
          const privateKey = configService.getOrThrow<string>('auth.jwtPrivateKey');
          return {
            privateKey,
            signOptions: {
              algorithm: 'RS256',
              expiresIn: configService.get<number>('auth.clientSessionExpires', 3600),
            },
          };
        }
        return {
          secret: configService.get<string>('auth.jwtSecret'),
          signOptions: {
            expiresIn: configService.get<number>('auth.clientSessionExpires', 3600),
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [ClientPortalController],
  providers: [
    ClientAuthService,
    ClientPortalService,
    AvailabilityService,
    ClientTokenGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: ClientPortalTenantContextInterceptor,
    },
    {
      provide: TENANT_REPO_CLIENT,
      useFactory: (repo: Repository<Client>) => new TenantAwareRepository(repo),
      inject: [getRepositoryToken(Client)],
    },
  ],
  exports: [ClientAuthService, ClientPortalService, AvailabilityService],
})
export class ClientPortalModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(ValidateTenantSlugMiddleware)
      .forRoutes(
        'client-portal/:slug/auth/request-magic-link',
        'client-portal/:slug/packages',
        'client-portal/:slug/packages/:id',
        'client-portal/:slug/packages/:id/reviews',
        'client-portal/:slug/packages/:id/availability',
      );
  }
}
