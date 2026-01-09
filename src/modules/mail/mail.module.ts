import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { EmailTemplatesController } from './controllers/email-templates.controller';
import { EmailTemplate } from './entities/email-template.entity';
import { BookingCancelledHandler } from './handlers/booking-cancelled.handler';
import { BookingConfirmedMailHandler } from './handlers/booking-confirmed.handler';
import { PaymentReceivedHandler } from './handlers/payment-received.handler';
import { TaskAssignedHandler } from './handlers/task-assigned.handler';
import { MailService } from './mail.service';
import { EMAIL_QUEUE, EmailProcessor } from './processors/email.processor';
import { MailQueueService } from './services/mail-queue.service';
import { MailSenderService } from './services/mail-sender.service';
import { MailTemplateService } from './services/mail-template.service';

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
    TypeOrmModule.forFeature([EmailTemplate]),
  ],
  controllers: [EmailTemplatesController],
  providers: [
    MailTemplateService,
    MailSenderService,
    MailQueueService,
    MailService,
    EmailProcessor,
    BookingConfirmedMailHandler,
    BookingCancelledHandler,
    PaymentReceivedHandler,
    TaskAssignedHandler,
  ],
  exports: [MailService, MailSenderService, MailQueueService],
})
export class MailModule {}
