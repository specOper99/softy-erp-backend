import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  BookingEmailData,
  CancellationEmailData,
  EMAIL_QUEUE,
  EmailJobData,
  EmailVerificationEmailData,
  NewDeviceLoginEmailData,
  PasswordResetEmailData,
  PaymentReceiptEmailData,
  PayrollEmailData,
  SuspiciousActivityEmailData,
  TaskAssignmentEmailData,
} from '../mail.types';
import { MailSenderService } from './mail-sender.service';

@Injectable()
export class MailQueueService {
  private readonly logger = new Logger(MailQueueService.name);

  constructor(
    @Optional()
    @InjectQueue(EMAIL_QUEUE)
    private readonly emailQueue?: Queue<EmailJobData>,
    @Optional()
    private readonly senderService?: MailSenderService,
  ) {}

  private readonly defaultJobOptions = {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 2000 },
  };

  async queueBookingConfirmation(data: BookingEmailData): Promise<void> {
    if (!this.emailQueue) {
      this.logger.warn('Email queue not available, sending directly');
      if (this.senderService) {
        await this.senderService.sendBookingConfirmation(data);
      }
      return;
    }

    await this.emailQueue.add(
      'booking-confirmation',
      {
        type: 'booking-confirmation',
        data: {
          ...data,
          eventDate: data.eventDate.toISOString(),
        },
      },
      this.defaultJobOptions,
    );
    this.logger.log(`Queued booking confirmation email for ${data.clientEmail}`);
  }

  async queueTaskAssignment(data: TaskAssignmentEmailData): Promise<void> {
    if (!this.emailQueue) {
      this.logger.warn('Email queue not available, sending directly');
      if (this.senderService) {
        await this.senderService.sendTaskAssignment(data);
      }
      return;
    }

    await this.emailQueue.add(
      'task-assignment',
      {
        type: 'task-assignment',
        data: {
          ...data,
          eventDate: data.eventDate.toISOString(),
        },
      },
      this.defaultJobOptions,
    );
    this.logger.log(`Queued task assignment email for ${data.employeeEmail}`);
  }

  async queuePayrollNotification(data: PayrollEmailData): Promise<void> {
    if (!this.emailQueue) {
      this.logger.warn('Email queue not available, sending directly');
      if (this.senderService) {
        await this.senderService.sendPayrollNotification(data);
      }
      return;
    }

    await this.emailQueue.add(
      'payroll',
      {
        type: 'payroll',
        data: {
          ...data,
          payrollDate: data.payrollDate.toISOString(),
        },
      },
      this.defaultJobOptions,
    );
    this.logger.log(`Queued payroll notification email for ${data.employeeEmail}`);
  }

  async queuePasswordReset(data: PasswordResetEmailData): Promise<void> {
    if (!this.emailQueue) {
      this.logger.warn('Email queue not available, sending directly');
      if (this.senderService) {
        await this.senderService.sendPasswordReset(data);
      }
      return;
    }

    await this.emailQueue.add(
      'password-reset',
      {
        type: 'password-reset',
        data,
      },
      this.defaultJobOptions,
    );
    this.logger.log(`Queued password reset email for ${data.email}`);
  }

  async queueEmailVerification(data: EmailVerificationEmailData): Promise<void> {
    if (!this.emailQueue) {
      this.logger.warn('Email queue not available, sending directly');
      if (this.senderService) {
        await this.senderService.sendEmailVerification(data);
      }
      return;
    }

    await this.emailQueue.add(
      'email-verification',
      {
        type: 'email-verification',
        data,
      },
      this.defaultJobOptions,
    );
    this.logger.log(`Queued email verification email for ${data.email}`);
  }

  async queueNewDeviceLogin(data: NewDeviceLoginEmailData): Promise<void> {
    if (!this.emailQueue) {
      this.logger.warn('Email queue not available, sending directly');
      if (this.senderService) {
        await this.senderService.sendNewDeviceLogin(data);
      }
      return;
    }

    await this.emailQueue.add(
      'new-device-login',
      {
        type: 'new-device-login',
        data: {
          ...data,
          time: data.time.toISOString(),
        },
      },
      this.defaultJobOptions,
    );
    this.logger.log(`Queued new device login alert for ${data.email}`);
  }

  async queueSuspiciousActivity(data: SuspiciousActivityEmailData): Promise<void> {
    if (!this.emailQueue) {
      this.logger.warn('Email queue not available, sending directly');
      if (this.senderService) {
        await this.senderService.sendSuspiciousActivityAlert(data);
      }
      return;
    }

    await this.emailQueue.add(
      'suspicious-activity',
      {
        type: 'suspicious-activity',
        data: {
          ...data,
          time: data.time.toISOString(),
        },
      },
      this.defaultJobOptions,
    );
    this.logger.log(`Queued suspicious activity alert for ${data.email}`);
  }

  async queueCancellationEmail(data: CancellationEmailData): Promise<void> {
    if (!this.emailQueue) {
      this.logger.warn(`Email queue not available. Skipping cancellation email to ${data.to}`);
      return;
    }

    await this.emailQueue.add(
      'booking-cancellation',
      {
        type: 'booking-cancellation',
        data: {
          ...data,
          eventDate: data.eventDate.toISOString(),
          cancelledAt: data.cancelledAt.toISOString(),
        },
      },
      this.defaultJobOptions,
    );
    this.logger.log(`Queued cancellation email for ${data.bookingId}`);
  }

  async queuePaymentReceipt(data: PaymentReceiptEmailData): Promise<void> {
    if (!this.emailQueue) {
      this.logger.warn(`Email queue not available. Skipping payment receipt email to ${data.to}`);
      return;
    }

    await this.emailQueue.add(
      'payment-receipt',
      {
        type: 'payment-receipt',
        data: {
          ...data,
          eventDate: data.eventDate.toISOString(),
        },
      },
      this.defaultJobOptions,
    );
    this.logger.log(`Queued payment receipt email for ${data.reference}`);
  }
}
