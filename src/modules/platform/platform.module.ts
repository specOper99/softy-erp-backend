import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { AuthModule } from '../auth/auth.module';
import { Tenant } from '../tenants/entities/tenant.entity';
import { TenantsModule } from '../tenants/tenants.module';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { PlatformAuthController } from './auth/controllers/platform-auth.controller';
import { PlatformRefreshToken } from './auth/entities/platform-refresh-token.entity';
import { PlatformJwtAuthGuard } from './auth/guards/platform-jwt-auth.guard';
import { PlatformAuthService } from './auth/services/platform-auth.service';
import { PlatformJwtStrategy } from './auth/strategies/platform-jwt.strategy';
import { PlatformAnalyticsController } from './controllers/platform-analytics.controller';
import { PlatformAuditController } from './controllers/platform-audit.controller';
import { PlatformSecurityController } from './controllers/platform-security.controller';
import { PlatformSupportController } from './controllers/platform-support.controller';
import { PlatformTenantsController } from './controllers/platform-tenants.controller';
import { MFAController } from './controllers/mfa.controller';
import { MfaLoginController } from './auth/controllers/mfa-login.controller';
import { ImpersonationSession } from './entities/impersonation-session.entity';
import { PlatformAuditLog } from './entities/platform-audit-log.entity';
import { PlatformUser } from './entities/platform-user.entity';
import { TenantLifecycleEvent } from './entities/tenant-lifecycle-event.entity';
import { PlatformPermissionsGuard } from './guards/platform-permissions.guard';
import { RequireReasonGuard } from './guards/require-reason.guard';
import { ImpersonationService } from './services/impersonation.service';
import { MFAService } from './services/mfa.service';
import { PlatformAnalyticsService } from './services/platform-analytics.service';
import { PlatformAuditService } from './services/platform-audit.service';
import { PlatformSecurityService } from './services/platform-security.service';
import { PlatformTenantService } from './services/platform-tenant.service';

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
