import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TENANT_REPO_CLIENT } from '../../common/constants/tenant-repo.tokens';
import { TenantAwareRepository } from '../../common/repositories/tenant-aware.repository';
import { Booking } from '../bookings/entities/booking.entity';
import { Client } from '../bookings/entities/client.entity';
import { MailModule } from '../mail/mail.module';
import { MetricsModule } from '../metrics/metrics.module';
import { ClientPortalController } from './client-portal.controller';
import { ClientAuthService } from './services/client-auth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client, Booking]),
    MailModule,
    MetricsModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('auth.jwtSecret'),
        signOptions: {
          expiresIn: configService.get<number>(
            'auth.clientSessionExpires',
            3600,
          ),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [ClientPortalController],
  providers: [
    ClientAuthService,
    {
      provide: TENANT_REPO_CLIENT,
      useFactory: (repo: Repository<Client>) => new TenantAwareRepository(repo),
      inject: [getRepositoryToken(Client)],
    },
  ],
  exports: [ClientAuthService],
})
export class ClientPortalModule {}
