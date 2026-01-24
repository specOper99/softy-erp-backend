import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { RefreshToken } from '../auth/entities/refresh-token.entity';

// Entities
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { ImpersonationSession } from './entities/impersonation-session.entity';
import { PlatformAuditLog } from './entities/platform-audit-log.entity';
import { PlatformSession } from './entities/platform-session.entity';
import { PlatformUser } from './entities/platform-user.entity';
import { TenantLifecycleEvent } from './entities/tenant-lifecycle-event.entity';
import { Task } from '../tasks/entities/task.entity';
import { TimeEntry } from '../tasks/entities/time-entry.entity';

// Services
import { EmailNotificationService } from './services/email-notification.service';
import { ImpersonationService } from './services/impersonation.service';
import { MFAService } from './services/mfa.service';
import { PlatformAnalyticsService } from './services/platform-analytics.service';
import { PlatformAuditService } from './services/platform-audit.service';
import { PlatformAuthService } from './services/platform-auth.service';
import { PlatformSecurityService } from './services/platform-security.service';
import { PlatformTenantService } from './services/platform-tenant.service';
import { PlatformTimeEntriesService } from './services/platform-time-entries.service';
import { PlatformMfaTokenService } from './services/platform-mfa-token.service';

// Controllers
import { MFAController } from './controllers/mfa.controller';
import { PlatformMfaLoginController } from './controllers/mfa-login.controller';
import { PlatformAnalyticsController } from './controllers/platform-analytics.controller';
import { PlatformAuditController } from './controllers/platform-audit.controller';
import { PlatformAuthController } from './controllers/platform-auth.controller';
import { PlatformSecurityController } from './controllers/platform-security.controller';
import { PlatformSupportController } from './controllers/platform-support.controller';
import { PlatformTenantsController } from './controllers/platform-tenants.controller';
import { PlatformTimeEntriesController } from './controllers/platform-time-entries.controller';

// Guards & Strategies
import { PlatformJwtAuthGuard } from './guards/platform-jwt-auth.guard';
import { PlatformPermissionsGuard } from './guards/platform-permissions.guard';
import { RequireReasonGuard } from './guards/require-reason.guard';
import { PlatformJwtStrategy } from './strategies/platform-jwt.strategy';

/**
 * Platform module for superadmin console functionality
 * Handles tenant management, billing, support, security, and compliance
 */
@Module({
  imports: [
    CommonModule,
    AuthModule,
    PassportModule,
    TypeOrmModule.forFeature([
      PlatformUser,
      PlatformSession,
      PlatformAuditLog,
      ImpersonationSession,
      TenantLifecycleEvent,
      Tenant,
      Task,
      TimeEntry,
      User,
      RefreshToken,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: parseInt(configService.get<string>('JWT_ACCESS_EXPIRES_SECONDS', '900'), 10),
        },
      }),
    }),
  ],
  controllers: [
    PlatformTenantsController,
    PlatformSupportController,
    PlatformAuditController,
    PlatformAuthController,
    PlatformSecurityController,
    PlatformAnalyticsController,
    PlatformTimeEntriesController,
    MFAController,
    PlatformMfaLoginController,
  ],
  providers: [
    PlatformAuditService,
    PlatformTenantService,
    ImpersonationService,
    PlatformAuthService,
    PlatformSecurityService,
    PlatformAnalyticsService,
    PlatformTimeEntriesService,
    MFAService,
    EmailNotificationService,
    PlatformMfaTokenService,
    PlatformJwtStrategy,
    PlatformJwtAuthGuard,
    PlatformPermissionsGuard,
    RequireReasonGuard,
  ],
  exports: [
    PlatformAuditService,
    PlatformTenantService,
    ImpersonationService,
    PlatformAuthService,
    PlatformSecurityService,
    PlatformAnalyticsService,
    MFAService,
    EmailNotificationService,
  ],
})
export class PlatformModule {}
