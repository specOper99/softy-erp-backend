import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TENANT_REPO_CLIENT } from '../../common/constants/tenant-repo.tokens';
import { TenantAwareRepository } from '../../common/repositories/tenant-aware.repository';
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
import { ClientPortalController } from './controllers/client-portal-extended.controller';
import { ClientTokenGuard } from './guards/client-token.guard';
import { AvailabilityService } from './services/availability.service';
import { ClientAuthService } from './services/client-auth.service';
import { ClientPortalService } from './services/client-portal.service';

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
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('auth.jwtSecret'),
        signOptions: {
          expiresIn: configService.get<number>('auth.clientSessionExpires', 3600),
        },
      }),
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
      provide: TENANT_REPO_CLIENT,
      useFactory: (repo: Repository<Client>) => new TenantAwareRepository(repo),
      inject: [getRepositoryToken(Client)],
    },
  ],
  exports: [ClientAuthService, ClientPortalService, AvailabilityService],
})
export class ClientPortalModule {}
