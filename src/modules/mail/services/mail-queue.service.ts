import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  BookingCancellationJobData,
  BookingConfirmationJobData,
  BookingEmailData,
  CancellationEmailData,
  EMAIL_QUEUE,
  EmailJobData,
  EmailVerificationEmailData,
  NewDeviceLoginJobData,
  NewDeviceLoginEmailData,
  PasswordResetEmailData,
  PaymentReceiptJobData,
  PaymentReceiptEmailData,
  PayrollJobData,
  PayrollEmailData,
  SuspiciousActivityJobData,
  SuspiciousActivityEmailData,
  TaskAssignmentJobData,
  TaskAssignmentEmailData,
} from '../mail.types';
import { MailSenderService } from './mail-sender.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';

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

  private getTenantId(): string {
    return TenantContextService.getTenantId() ?? 'system';
  }

  async queueBookingConfirmation(data: BookingEmailData): Promise<void> {
    const jobData: BookingConfirmationJobData = {
      tenantId: this.getTenantId(),
      clientName: data.clientName,
      clientEmail: data.clientEmail,
      eventDate: data.eventDate.toISOString(),
      packageName: data.packageName,
      totalPrice: data.totalPrice,
      bookingId: data.bookingId,
    };

    if (!this.emailQueue) {
      this.logger.warn('Email queue not available, sending directly');
      if (this.senderService) {
        await this.senderService.sendBookingConfirmation(data);
      }
      return;
    }

    await this.emailQueue.add(
      'booking-confirmation',
      { type: 'booking-confirmation', data: jobData },
      this.defaultJobOptions,
    );
    this.logger.log(`Queued booking confirmation email for ${data.clientEmail}`);
  }

  async queueTaskAssignment(data: TaskAssignmentEmailData): Promise<void> {
    const jobData: TaskAssignmentJobData = {
      tenantId: this.getTenantId(),
      employeeName: data.employeeName,
      employeeEmail: data.employeeEmail,
      taskType: data.taskType,
      clientName: data.clientName,
      eventDate: data.eventDate.toISOString(),
      commission: data.commission,
    };

    if (!this.emailQueue) {
      this.logger.warn('Email queue not available, sending directly');
      if (this.senderService) {
        await this.senderService.sendTaskAssignment(data);
      }
      return;
    }

    await this.emailQueue.add('task-assignment', { type: 'task-assignment', data: jobData }, this.defaultJobOptions);
    this.logger.log(`Queued task assignment email for ${data.employeeEmail}`);
  }

  async queuePayrollNotification(data: PayrollEmailData): Promise<void> {
    const jobData: PayrollJobData = {
      tenantId: this.getTenantId(),
      employeeName: data.employeeName,
      employeeEmail: data.employeeEmail,
      baseSalary: data.baseSalary,
      commission: data.commission,
      totalPayout: data.totalPayout,
      payrollDate: data.payrollDate.toISOString(),
    };

    if (!this.emailQueue) {
      this.logger.warn('Email queue not available, sending directly');
      if (this.senderService) {
        await this.senderService.sendPayrollNotification(data);
      }
      return;
    }

    await this.emailQueue.add('payroll', { type: 'payroll', data: jobData }, this.defaultJobOptions);
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
        data: { ...data, tenantId: this.getTenantId() },
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
        data: { ...data, tenantId: this.getTenantId() },
      },
      this.defaultJobOptions,
    );
    this.logger.log(`Queued email verification email for ${data.email}`);
  }

  async queueNewDeviceLogin(data: NewDeviceLoginEmailData): Promise<void> {
    const jobData: NewDeviceLoginJobData = {
      tenantId: this.getTenantId(),
      email: data.email,
      name: data.name,
      device: data.device,
      ipAddress: data.ipAddress,
      time: data.time.toISOString(),
      location: data.location,
    };

    if (!this.emailQueue) {
      this.logger.warn('Email queue not available, sending directly');
      if (this.senderService) {
        await this.senderService.sendNewDeviceLogin(data);
      }
      return;
    }

    await this.emailQueue.add('new-device-login', { type: 'new-device-login', data: jobData }, this.defaultJobOptions);
    this.logger.log(`Queued new device login alert for ${data.email}`);
  }

  async queueSuspiciousActivity(data: SuspiciousActivityEmailData): Promise<void> {
    const jobData: SuspiciousActivityJobData = {
      tenantId: this.getTenantId(),
      email: data.email,
      name: data.name,
      activityType: data.activityType,
      details: data.details,
      ipAddress: data.ipAddress,
      time: data.time.toISOString(),
      location: data.location,
    };

    if (!this.emailQueue) {
      this.logger.warn('Email queue not available, sending directly');
      if (this.senderService) {
        await this.senderService.sendSuspiciousActivityAlert(data);
      }
      return;
    }

    await this.emailQueue.add(
      'suspicious-activity',
      { type: 'suspicious-activity', data: jobData },
      this.defaultJobOptions,
    );
    this.logger.log(`Queued suspicious activity alert for ${data.email}`);
  }

  async queueCancellationEmail(data: CancellationEmailData): Promise<void> {
    const jobData: BookingCancellationJobData = {
      tenantId: this.getTenantId(),
      clientName: data.clientName,
      to: data.to,
      bookingId: data.bookingId,
      eventDate: data.eventDate.toISOString(),
      cancelledAt: data.cancelledAt.toISOString(),
      daysBeforeEvent: data.daysBeforeEvent,
      cancellationReason: data.cancellationReason,
      amountPaid: data.amountPaid,
      refundAmount: data.refundAmount,
      refundPercentage: data.refundPercentage,
    };

    if (!this.emailQueue) {
      this.logger.warn(`Email queue not available. Skipping cancellation email to ${data.to}`);
      return;
    }

    await this.emailQueue.add(
      'booking-cancellation',
      { type: 'booking-cancellation', data: jobData },
      this.defaultJobOptions,
    );
    this.logger.log(`Queued cancellation email for ${data.bookingId}`);
  }

  async queuePaymentReceipt(data: PaymentReceiptEmailData): Promise<void> {
    const jobData: PaymentReceiptJobData = {
      tenantId: this.getTenantId(),
      clientName: data.clientName,
      to: data.to,
      bookingId: data.bookingId,
      eventDate: data.eventDate.toISOString(),
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      reference: data.reference,
      totalPrice: data.totalPrice,
      amountPaid: data.amountPaid,
    };

    if (!this.emailQueue) {
      this.logger.warn(`Email queue not available. Skipping payment receipt email to ${data.to}`);
      return;
    }

    await this.emailQueue.add('payment-receipt', { type: 'payment-receipt', data: jobData }, this.defaultJobOptions);
    this.logger.log(`Queued payment receipt email for ${data.reference}`);
  }
}
