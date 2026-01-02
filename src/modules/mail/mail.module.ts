import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { join } from 'path';
import { BookingConfirmedMailHandler } from './handlers/booking-confirmed.handler';
import { MailService } from './mail.service';
import { EMAIL_QUEUE, EmailProcessor } from './processors/email.processor';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get('MAIL_HOST', 'smtp.gmail.com'),
          port: parseInt(configService.get('MAIL_PORT', '587')),
          secure: false,
          auth: {
            user: configService.get('MAIL_USER'),
            pass: configService.get('MAIL_PASS'),
          },
        },
        defaults: {
          from:
            configService.get('MAIL_FROM') ||
            `"${configService.get('MAIL_FROM_NAME', 'SaaS App')}" <${configService.get('MAIL_FROM_ADDRESS', 'noreply@example.com')}>`,
        },
        template: {
          dir: join(__dirname, 'templates'),
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
      }),
    }),
    BullModule.registerQueue({
      name: EMAIL_QUEUE,
    }),
    CqrsModule,
  ],
  providers: [MailService, EmailProcessor, BookingConfirmedMailHandler],
  exports: [MailService],
})
export class MailModule {}
