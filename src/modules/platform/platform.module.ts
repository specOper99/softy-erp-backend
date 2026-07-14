import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { RefreshToken } from '../auth/domain/entities/refresh-token.entity';
import { AuthModule } from '../auth/auth.module';
import { Tenant } from '../tenants/domain/entities/tenant.entity';
import { TenantsModule } from '../tenants/tenants.module';
import { User } from '../users/domain/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { PlatformAuthController } from './api/controllers/platform-auth.controller';
import { PlatformRefreshToken } from './domain/entities/platform-refresh-token.entity';
import { PlatformJwtAuthGuard } from './infrastructure/guards/platform-jwt-auth.guard';
import { PlatformAuthService } from './application/platform-auth.service';
import { PlatformJwtStrategy } from './infrastructure/strategies/platform-jwt.strategy';
import { PlatformAnalyticsController } from './api/controllers/platform-analytics.controller';
import { PlatformAuditController } from './api/controllers/platform-audit.controller';
import { PlatformSecurityController } from './api/controllers/platform-security.controller';
import { PlatformSupportController } from './api/controllers/platform-support.controller';
import { PlatformTenantsController } from './api/controllers/platform-tenants.controller';
import { MFAController } from './api/controllers/mfa.controller';
import { MfaLoginController } from './api/controllers/mfa-login.controller';
import { ImpersonationSession } from './domain/entities/impersonation-session.entity';
import { PlatformAuditLog } from './domain/entities/platform-audit-log.entity';
import { PlatformUser } from './domain/entities/platform-user.entity';
import { TenantLifecycleEvent } from './domain/entities/tenant-lifecycle-event.entity';
import { PlatformPermissionsGuard } from './infrastructure/guards/platform-permissions.guard';
import { RequireReasonGuard } from './infrastructure/guards/require-reason.guard';
import { ImpersonationService } from './application/impersonation.service';
import { MFAService } from './application/mfa.service';
import { PlatformAnalyticsService } from './application/platform-analytics.service';
import { PlatformAuditService } from './application/platform-audit.service';
import { PlatformSecurityService } from './application/platform-security.service';
import { PlatformTenantService } from './application/platform-tenant.service';
import { TenantDeletionCron } from './infrastructure/cron/tenant-deletion.cron';
import { TenantDeletionExecutorService } from './application/tenant-deletion-executor.service';
import { TenantPurgeService } from './application/tenant-purge.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlatformUser,
      PlatformRefreshToken,
      Tenant,
      TenantLifecycleEvent,
      ImpersonationSession,
      PlatformAuditLog,
      User,
      RefreshToken,
    ]),
    PassportModule.register({ defaultStrategy: 'platform-jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('PLATFORM_JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<number>('JWT_ACCESS_EXPIRES_SECONDS', 900),
          audience: 'platform',
        },
      }),
    }),
    CommonModule,
    AuthModule,
    UsersModule,
    TenantsModule,
  ],
  controllers: [
    PlatformAuthController,
    PlatformTenantsController,
    PlatformAnalyticsController,
    PlatformAuditController,
    PlatformSupportController,
    PlatformSecurityController,
    MFAController,
    MfaLoginController,
  ],
  providers: [
    PlatformAuthService,
    PlatformTenantService,
    PlatformAnalyticsService,
    PlatformAuditService,
    PlatformSecurityService,
    TenantPurgeService,
    TenantDeletionExecutorService,
    TenantDeletionCron,
    ImpersonationService,
    MFAService,
    PlatformJwtStrategy,
    PlatformJwtAuthGuard,
    PlatformPermissionsGuard,
    RequireReasonGuard,
  ],
  exports: [TypeOrmModule],
})
export class PlatformModule {}
