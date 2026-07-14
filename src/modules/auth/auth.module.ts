import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { GeoIpService } from '../../common/services/geoip.service';
import { getAllowedJwtAlgorithm } from '../../common/utils/jwt-algorithm.util';
import { MailModule } from '../mail/mail.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './api/auth.controller';
import { AuthService } from './application/auth.service';
import { EmailVerificationToken } from './domain/entities/email-verification-token.entity';
import { PasswordResetToken } from './domain/entities/password-reset-token.entity';
import { RefreshToken } from './domain/entities/refresh-token.entity';
import { MfaRequiredGuard, WsJwtGuard } from './infrastructure/guards';
import { UserDeactivatedHandler } from './infrastructure/handlers/user-deactivated.handler';
import { AccountLockoutService } from './application/account-lockout.service';
import { MfaTokenService } from './application/mfa-token.service';
import { MfaService } from './application/mfa.service';
import { PasswordService } from './application/password.service';
import { SessionService } from './application/session.service';
import { TokenBlacklistService } from './application/token-blacklist.service';
import { TokenService } from './application/token.service';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    TenantsModule,
    MailModule,
    CommonModule,
    TypeOrmModule.forFeature([RefreshToken, PasswordResetToken, EmailVerificationToken]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const algorithm = getAllowedJwtAlgorithm(configService);
        if (algorithm === 'RS256') {
          const privateKey = configService.getOrThrow<string>('auth.jwtPrivateKey');
          return {
            privateKey,
            signOptions: {
              algorithm: 'RS256',
              expiresIn: configService.get<number>('auth.jwtAccessExpiresSeconds'),
            },
          };
        }
        return {
          secret: configService.get<string>('auth.jwtSecret'),
          signOptions: {
            expiresIn: configService.get<number>('auth.jwtAccessExpiresSeconds'),
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    MfaService,
    MfaTokenService,
    SessionService,
    PasswordService,
    JwtStrategy,
    AccountLockoutService,
    MfaRequiredGuard,
    GeoIpService,
    TokenBlacklistService,
    WsJwtGuard,
    UserDeactivatedHandler,
  ],
  exports: [
    AuthService,
    PasswordService,
    TokenService,
    TokenBlacklistService,
    MfaService,
    MfaTokenService,
    SessionService,
    JwtModule,
    MfaRequiredGuard,
    WsJwtGuard,
  ],
})
export class AuthModule {}
