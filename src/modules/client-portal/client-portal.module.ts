import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from '../bookings/entities/booking.entity';
import { Client } from '../bookings/entities/client.entity';
import { MailModule } from '../mail/mail.module';
import { ClientPortalController } from './client-portal.controller';
import { ClientAuthService } from './services/client-auth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client, Booking]),
    MailModule,
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
  providers: [ClientAuthService],
  exports: [ClientAuthService],
})
export class ClientPortalModule {}
