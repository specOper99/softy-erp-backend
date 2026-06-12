import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { Tenant } from '../tenants/entities/tenant.entity';
import { PlatformAuthController } from './auth/controllers/platform-auth.controller';
import { PlatformRefreshToken } from './auth/entities/platform-refresh-token.entity';
import { PlatformJwtAuthGuard } from './auth/guards/platform-jwt-auth.guard';
import { PlatformAuthService } from './auth/services/platform-auth.service';
import { PlatformJwtStrategy } from './auth/strategies/platform-jwt.strategy';
import { PlatformTenantsController } from './controllers/platform-tenants.controller';
import { PlatformUser } from './entities/platform-user.entity';
import { TenantLifecycleEvent } from './entities/tenant-lifecycle-event.entity';
import { PlatformPermissionsGuard } from './guards/platform-permissions.guard';
import { RequireReasonGuard } from './guards/require-reason.guard';
import { PlatformTenantService } from './services/platform-tenant.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformUser, PlatformRefreshToken, Tenant, TenantLifecycleEvent]),
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
  ],
  controllers: [PlatformAuthController, PlatformTenantsController],
  providers: [
    PlatformAuthService,
    PlatformTenantService,
    PlatformJwtStrategy,
    PlatformJwtAuthGuard,
    PlatformPermissionsGuard,
    RequireReasonGuard,
  ],
  exports: [TypeOrmModule],
})
export class PlatformModule {}
