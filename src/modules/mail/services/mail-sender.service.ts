import { MailerService } from '@nestjs-modules/mailer';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as CircuitBreaker from 'opossum';
import {
  BookingEmailData,
  EmailResult,
  EmailVerificationEmailData,
  MagicLinkEmailData,
  NewDeviceLoginEmailData,
  PasswordResetEmailData,
  PayrollEmailData,
  SuspiciousActivityEmailData,
  TaskAssignmentEmailData,
} from '../mail.types';
import { MailTemplateService } from './mail-template.service';

@Injectable()
export class MailSenderService {
  private readonly logger = new Logger(MailSenderService.name);
  private readonly isEnabled: boolean;
  private readonly maxRetries = 2;
  private readonly retryDelayMs = 1000;

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
    private readonly templateService: MailTemplateService,
    @Inject('CIRCUIT_BREAKER_MAIL')
    private readonly breaker: CircuitBreaker,
  ) {
    this.isEnabled = !!this.configService.get('MAIL_USER');
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string,
  ): Promise<{ result?: T; retried: boolean; error?: Error }> {
    let lastError: Error | undefined;
    let retried = false;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await operation();
        return { result, retried };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries) {
          retried = true;
          const delay = this.retryDelayMs * Math.pow(2, attempt);
          this.logger.warn(`${context} failed (attempt ${attempt + 1}/${this.maxRetries + 1}), retrying in ${delay}ms`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    return { retried, error: lastError };
  }

  async sendBookingConfirmation(data: BookingEmailData): Promise<EmailResult> {
    if (!this.isEnabled) {
      this.logger.log(`[DEV] Booking confirmation email to ${data.clientEmail}`, data);
      return { success: true, email: data.clientEmail };
    }

    const templateData = await this.templateService.resolveTemplate('booking-confirmation', 'booking-confirmation', {
      clientName: data.clientName,
    });

    const { retried, error } = await this.withRetry(
      () =>
        this.breaker.fire(() =>
          this.mailerService.sendMail({
            to: data.clientEmail,
            subject: `Booking Confirmed - ${data.packageName}`,
            ...templateData,
            context: this.templateService.sanitizeContext(
              this.templateService.buildCommonContext({
                clientName: data.clientName,
                eventDate: this.templateService.formatDate(data.eventDate),
                packageName: data.packageName,
                totalPrice: this.templateService.formatCurrency(data.totalPrice),
                bookingId: data.bookingId,
              }),
            ),
          }),
        ),
      `Booking confirmation to ${data.clientEmail}`,
    );

    if (error) {
      this.logger.error(
        `Failed to send booking confirmation to ${data.clientEmail} after ${this.maxRetries + 1} attempts`,
        error,
      );
      return {
        success: false,
        email: data.clientEmail,
        error: error.message,
        retried,
      };
    }

    this.logger.log(`Booking confirmation sent to ${data.clientEmail}${retried ? ' (after retry)' : ''}`);
    return { success: true, email: data.clientEmail, retried };
  }

  async sendTaskAssignment(data: TaskAssignmentEmailData): Promise<EmailResult> {
    if (!this.isEnabled) {
      this.logger.log(`[DEV] Task assignment email to ${data.employeeEmail}`, data);
      return { success: true, email: data.employeeEmail };
    }

    const { retried, error } = await this.withRetry(
      () =>
        this.breaker.fire(() =>
          this.mailerService.sendMail({
            to: data.employeeEmail,
            subject: `New Task Assigned: ${data.taskType}`,
            template: 'task-assignment',
            context: this.templateService.sanitizeContext(
              this.templateService.buildCommonContext({
                employeeName: data.employeeName,
                taskType: data.taskType,
                clientName: data.clientName,
                eventDate: this.templateService.formatDate(data.eventDate),
                commission: this.templateService.formatCurrency(data.commission),
              }),
            ),
          }),
        ),
      `Task assignment to ${data.employeeEmail}`,
    );

    if (error) {
      this.logger.error(
        `Failed to send task assignment to ${data.employeeEmail} after ${this.maxRetries + 1} attempts`,
        error,
      );
      return {
        success: false,
        email: data.employeeEmail,
        error: error.message,
        retried,
      };
    }

    this.logger.log(`Task assignment sent to ${data.employeeEmail}${retried ? ' (after retry)' : ''}`);
    return { success: true, email: data.employeeEmail, retried };
  }

  async sendPayrollNotification(data: PayrollEmailData): Promise<EmailResult> {
    if (!this.isEnabled) {
      this.logger.log(`[DEV] Payroll notification email to ${data.employeeEmail}`, data);
      return { success: true, email: data.employeeEmail };
    }

    const { retried, error } = await this.withRetry(
      () =>
        this.breaker.fire(() =>
          this.mailerService.sendMail({
            to: data.employeeEmail,
            subject: 'Payroll Processed - Payment Details',
            template: 'payroll-notification',
            context: this.templateService.sanitizeContext(
              this.templateService.buildCommonContext({
                employeeName: data.employeeName,
                baseSalary: this.templateService.formatCurrency(data.baseSalary),
                commission: this.templateService.formatCurrency(data.commission),
                totalPayout: this.templateService.formatCurrency(data.totalPayout),
                payrollDate: this.templateService.formatDate(data.payrollDate),
              }),
            ),
          }),
        ),
      `Payroll notification to ${data.employeeEmail}`,
    );

    if (error) {
      this.logger.error(
        `Failed to send payroll notification to ${data.employeeEmail} after ${this.maxRetries + 1} attempts`,
        error,
      );
      return {
        success: false,
        email: data.employeeEmail,
        error: error.message,
        retried,
      };
    }

    this.logger.log(`Payroll notification sent to ${data.employeeEmail}${retried ? ' (after retry)' : ''}`);
    return { success: true, email: data.employeeEmail, retried };
  }

  async sendMagicLink(data: MagicLinkEmailData, locale = 'en'): Promise<EmailResult> {
    const portalUrl = this.configService.get<string>('CLIENT_PORTAL_URL', 'https://portal.example.com');
    const magicLinkUrl = `${portalUrl}/auth/verify?token=${data.token}`;

    if (!this.isEnabled) {
      this.logger.log(`[DEV] Magic link email to ${data.clientEmail}`, {
        ...data,
        magicLinkUrl,
      });
      return { success: true, email: data.clientEmail };
    }

    const { retried, error } = await this.withRetry(
      () =>
        this.breaker.fire(() =>
          this.mailerService.sendMail({
            to: data.clientEmail,
            subject: `Login to ${this.templateService.getCompanyName()} Client Portal`,
            template: 'magic-link',
            context: this.templateService.sanitizeContext(
              this.templateService.buildCommonContext({
                clientName: data.clientName,
                magicLinkUrl,
                expiresInHours: data.expiresInHours,
              }),
              locale,
            ),
          }),
        ),
      `Magic link to ${data.clientEmail}`,
    );

    if (error) {
      this.logger.error(
        `Failed to send magic link to ${data.clientEmail} after ${this.maxRetries + 1} attempts`,
        error,
      );
      return {
        success: false,
        email: data.clientEmail,
        error: error.message,
        retried,
      };
    }

    this.logger.log(`Magic link sent to ${data.clientEmail}${retried ? ' (after retry)' : ''}`);
    return { success: true, email: data.clientEmail, retried };
  }

  async sendPasswordReset(data: PasswordResetEmailData): Promise<EmailResult> {
    const appUrl = this.configService.get<string>('FRONTEND_URL', 'https://app.example.com');
    const resetUrl = `${appUrl}/auth/reset-password?token=${data.token}`;

    if (!this.isEnabled) {
      this.logger.log(`[DEV] Password reset email to ${data.email}`, {
        ...data,
        resetUrl,
      });
      return { success: true, email: data.email };
    }

    const { retried, error } = await this.withRetry(
      () =>
        this.breaker.fire(() =>
          this.mailerService.sendMail({
            to: data.email,
            subject: 'Reset Your Password',
            template: 'password-reset',
            context: this.templateService.sanitizeContext(
              this.templateService.buildCommonContext({
                name: data.name,
                resetUrl,
                expiresInHours: data.expiresInHours,
              }),
            ),
          }),
        ),
      `Password reset to ${data.email}`,
    );

    if (error) {
      this.logger.error(`Failed to send password reset to ${data.email}`, error);
      return {
        success: false,
        email: data.email,
        error: error.message,
        retried,
      };
    }

    return { success: true, email: data.email, retried };
  }

  async sendEmailVerification(data: EmailVerificationEmailData): Promise<EmailResult> {
    const appUrl = this.configService.get<string>('FRONTEND_URL', 'https://app.example.com');
    const verificationUrl = `${appUrl}/auth/verify-email?token=${data.token}`;

    if (!this.isEnabled) {
      this.logger.log(`[DEV] Email verification to ${data.email}`, {
        ...data,
        verificationUrl,
      });
      return { success: true, email: data.email };
    }

    const { retried, error } = await this.withRetry(
      () =>
        this.breaker.fire(() =>
          this.mailerService.sendMail({
            to: data.email,
            subject: 'Verify Your Email Address',
            template: 'email-verification',
            context: this.templateService.sanitizeContext(
              this.templateService.buildCommonContext({
                name: data.name,
                verificationUrl,
              }),
            ),
          }),
        ),
      `Email verification to ${data.email}`,
    );

    if (error) {
      this.logger.error(`Failed to send email verification to ${data.email}`, error);
      return {
        success: false,
        email: data.email,
        error: error.message,
        retried,
      };
    }

    return { success: true, email: data.email, retried };
  }

  async sendNewDeviceLogin(data: NewDeviceLoginEmailData): Promise<EmailResult> {
    if (!this.isEnabled) {
      this.logger.log(`[DEV] New device login email to ${data.email}`, data);
      return { success: true, email: data.email };
    }

    const { retried, error } = await this.withRetry(
      () =>
        this.breaker.fire(() =>
          this.mailerService.sendMail({
            to: data.email,
            subject: 'New Login Detected',
            template: 'new-device-login',
            context: this.templateService.sanitizeContext(
              this.templateService.buildCommonContext({
                name: data.name,
                device: data.device,
                ipAddress: data.ipAddress,
                location: data.location || 'Unknown Location',
                time: data.time.toLocaleString(),
              }),
            ),
          }),
        ),
      `New device login to ${data.email}`,
    );

    if (error) {
      this.logger.error(`Failed to send new device login alert to ${data.email}`, error);
      return {
        success: false,
        email: data.email,
        error: error.message,
        retried,
      };
    }

    return { success: true, email: data.email, retried };
  }

  async sendSuspiciousActivityAlert(data: SuspiciousActivityEmailData): Promise<EmailResult> {
    if (!this.isEnabled) {
      this.logger.log(`[DEV] Suspicious activity email to ${data.email}`, data);
      return { success: true, email: data.email };
    }

    const { retried, error } = await this.withRetry(
      () =>
        this.breaker.fire(() =>
          this.mailerService.sendMail({
            to: data.email,
            subject: 'Security Alert: Suspicious Activity Detected',
            template: 'suspicious-activity',
            context: this.templateService.sanitizeContext(
              this.templateService.buildCommonContext({
                name: data.name,
                activityType: data.activityType,
                details: data.details,
                ipAddress: data.ipAddress,
                location: data.location || 'Unknown Location',
                time: data.time.toLocaleString(),
              }),
            ),
          }),
        ),
      `Suspicious activity alert to ${data.email}`,
    );

    if (error) {
      this.logger.error(`Failed to send suspicious activity alert to ${data.email}`, error);
      return {
        success: false,
        email: data.email,
        error: error.message,
        retried,
      };
    }

    return { success: true, email: data.email, retried };
  }
}
