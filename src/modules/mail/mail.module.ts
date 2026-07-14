import { MailerModule, type MailerOptions } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'node:path';
import { Repository } from 'typeorm';
import { CommonModule } from '../../common/common.module';
import { OUTBOX_MAIL_CONSUMER } from '../../common/outbox/outbox-consumer.port';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { areBackgroundJobsEnabled } from '../../common/queue/background-jobs.runtime';
import { TenantAwareRepository } from '../../common/repositories/tenant-aware.repository';
import { parseEnvInt } from '../../common/utils/env-int.util';
import { EmailTemplatesController } from './api/email-templates.controller';
import { EmailTemplatesService } from './application/email-templates.service';
import { MailQueueService } from './application/mail-queue.service';
import { MailSenderService } from './application/mail-sender.service';
import { MailService } from './application/mail.service';
import { MailTemplateService } from './application/mail-template.service';
import { EMAIL_QUEUE } from './application/mail.types';
import { EmailTemplate } from './domain/entities';
import { BookingCancelledHandler } from './infrastructure/booking-cancelled.handler';
import { BookingConfirmedMailHandler } from './infrastructure/booking-confirmed.handler';
import { BookingRescheduledHandler } from './infrastructure/booking-rescheduled.handler';
import { EmailProcessor } from './infrastructure/email.processor';
import { OutboxMailConsumer } from './infrastructure/outbox-mail.consumer';
import { PaymentReceivedHandler } from './infrastructure/payment-received.handler';
import { TaskAssignedHandler } from './infrastructure/task-assigned.handler';

/** Injection token for tenant-aware EmailTemplate repository */
const EMAIL_TEMPLATE_REPO_TOKEN = 'EMAIL_TEMPLATE_TENANT_REPO';
const backgroundJobsEnabled = areBackgroundJobsEnabled();

export const createMailerOptions = (configService: ConfigService): MailerOptions => ({
  transport: {
    host: configService.get('MAIL_HOST', 'smtp.gmail.com'),
    port: parseEnvInt(configService.get<string>('MAIL_PORT'), 587),
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
    dir: join(__dirname, 'infrastructure', 'templates'),
    adapter: new HandlebarsAdapter(),
    options: {
      strict: true,
    },
  },
  options: {
    partials: {
      dir: join(__dirname, 'infrastructure', 'templates', 'partials'),
      options: {
        strict: true,
      },
    },
  },
});

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => createMailerOptions(configService),
    }),
    ...(backgroundJobsEnabled
      ? [
          BullModule.registerQueue({
            name: EMAIL_QUEUE,
          }),
        ]
      : []),
    CqrsModule,
    CommonModule,
    TypeOrmModule.forFeature([EmailTemplate]),
    forwardRef(() => OutboxModule),
  ],
  controllers: [EmailTemplatesController],
  providers: [
    MailSenderService,
    MailQueueService,
    MailService,
    ...(backgroundJobsEnabled ? [EmailProcessor] : []),
    BookingConfirmedMailHandler,
    BookingCancelledHandler,
    BookingRescheduledHandler,
    PaymentReceivedHandler,
    TaskAssignedHandler,
    OutboxMailConsumer,
    {
      provide: OUTBOX_MAIL_CONSUMER,
      useExisting: OutboxMailConsumer,
    },
    {
      provide: EMAIL_TEMPLATE_REPO_TOKEN,
      useFactory: (repo: Repository<EmailTemplate>) => new TenantAwareRepository(repo),
      inject: [getRepositoryToken(EmailTemplate)],
    },
    {
      provide: MailTemplateService,
      useFactory: (configService: ConfigService, templateRepo: TenantAwareRepository<EmailTemplate>) =>
        new MailTemplateService(configService, templateRepo),
      inject: [ConfigService, EMAIL_TEMPLATE_REPO_TOKEN],
    },
    {
      provide: EmailTemplatesService,
      useFactory: (repo: TenantAwareRepository<EmailTemplate>) => new EmailTemplatesService(repo),
      inject: [EMAIL_TEMPLATE_REPO_TOKEN],
    },
  ],
  exports: [MailService, MailSenderService, MailQueueService, EmailTemplatesService, OUTBOX_MAIL_CONSUMER],
})
export class MailModule {}
