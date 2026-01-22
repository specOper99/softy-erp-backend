import { Injectable, Logger } from '@nestjs/common';
import {
  BookingEmailData,
  CancellationEmailData,
  EmailResult,
  EmailVerificationEmailData,
  MagicLinkEmailData,
  NewDeviceLoginEmailData,
  PasswordResetEmailData,
  PaymentReceiptEmailData,
  PayrollEmailData,
  SuspiciousActivityEmailData,
  TaskAssignmentEmailData,
} from './mail.types';
import { MailQueueService } from './services/mail-queue.service';
import { MailSenderService } from './services/mail-sender.service';

export type {
  BookingEmailData,
  CancellationEmailData,
  EmailResult,
  EmailVerificationEmailData,
  MagicLinkEmailData,
  NewDeviceLoginEmailData,
  PasswordResetEmailData,
  PaymentReceiptEmailData,
  PayrollEmailData,
  SuspiciousActivityEmailData,
  TaskAssignmentEmailData,
} from './mail.types';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly queueService: MailQueueService,
    private readonly senderService: MailSenderService,
  ) {}

  // ==================== QUEUE METHODS (async background processing) ====================

  async queueBookingConfirmation(data: BookingEmailData): Promise<void> {
    return this.queueService.queueBookingConfirmation(data);
  }

  async queueTaskAssignment(data: TaskAssignmentEmailData): Promise<void> {
    return this.queueService.queueTaskAssignment(data);
  }

  async queuePayrollNotification(data: PayrollEmailData): Promise<void> {
    return this.queueService.queuePayrollNotification(data);
  }

  async queuePasswordReset(data: PasswordResetEmailData): Promise<void> {
    return this.queueService.queuePasswordReset(data);
  }

  async queueEmailVerification(data: EmailVerificationEmailData): Promise<void> {
    return this.queueService.queueEmailVerification(data);
  }

  async queueNewDeviceLogin(data: NewDeviceLoginEmailData): Promise<void> {
    return this.queueService.queueNewDeviceLogin(data);
  }

  async queueSuspiciousActivity(data: SuspiciousActivityEmailData): Promise<void> {
    return this.queueService.queueSuspiciousActivity(data);
  }

  // ==================== DIRECT SEND METHODS (used by processor) ====================

  async sendBookingConfirmation(data: BookingEmailData): Promise<EmailResult> {
    return this.senderService.sendBookingConfirmation(data);
  }

  async sendTaskAssignment(data: TaskAssignmentEmailData): Promise<EmailResult> {
    return this.senderService.sendTaskAssignment(data);
  }

  async sendPayrollNotification(data: PayrollEmailData): Promise<EmailResult> {
    return this.senderService.sendPayrollNotification(data);
  }

  async sendMagicLink(data: MagicLinkEmailData, locale = 'en'): Promise<EmailResult> {
    return this.senderService.sendMagicLink(data, locale);
  }

  async sendPasswordReset(data: PasswordResetEmailData): Promise<EmailResult> {
    return this.senderService.sendPasswordReset(data);
  }

  async sendEmailVerification(data: EmailVerificationEmailData): Promise<EmailResult> {
    return this.senderService.sendEmailVerification(data);
  }

  async sendNewDeviceLogin(data: NewDeviceLoginEmailData): Promise<EmailResult> {
    return this.senderService.sendNewDeviceLogin(data);
  }

  async sendSuspiciousActivityAlert(data: SuspiciousActivityEmailData): Promise<EmailResult> {
    return this.senderService.sendSuspiciousActivityAlert(data);
  }

  // ==================== QUEUE-ONLY METHODS (cancellation, payment receipt) ====================

  async sendCancellationEmail(payload: CancellationEmailData): Promise<void> {
    return this.queueService.queueCancellationEmail(payload);
  }

  async sendPaymentReceipt(payload: PaymentReceiptEmailData): Promise<void> {
    return this.queueService.queuePaymentReceipt(payload);
  }
}
