import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeoIpService } from '../../common/services/geoip.service';
import { MailModule } from '../mail/mail.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { MfaRequiredGuard } from './guards/mfa-required.guard';
import { AccountLockoutService } from './services/account-lockout.service';
import { MfaService } from './services/mfa.service';
import { PasswordService } from './services/password.service';
import { SessionService } from './services/session.service';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    TenantsModule,
    MailModule,
    TypeOrmModule.forFeature([
      RefreshToken,
      PasswordResetToken,
      EmailVerificationToken,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return {
          secret: configService.get<string>('auth.jwtSecret'),
          signOptions: {
            expiresIn: configService.get<number>('auth.jwtAccessExpires'),
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
    SessionService,
    PasswordService,
    JwtStrategy,
    AccountLockoutService,
    MfaRequiredGuard,
    GeoIpService,
    TokenBlacklistService,
  ],
  exports: [
    AuthService,
    TokenService,
    TokenBlacklistService,
    MfaService,
    SessionService,
    JwtModule,
    MfaRequiredGuard,
  ],
})
export class AuthModule {}
