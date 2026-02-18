import { ISendMailOptions, MailerService } from '@nestjs-modules/mailer';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as CircuitBreaker from 'opossum';
import {
  BookingRescheduledStaffEmailData,
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

  private async sendEmail(params: {
    to: string;
    subject: string;
    logLabel: string;
    templateName?: string;
    resolutionResult?: { template?: string; html?: string };
    context: Record<string, unknown>;
  }): Promise<EmailResult> {
    if (!this.isEnabled) {
      this.logger.log(`[DEV] ${params.logLabel} to ${params.to}`, params.context);
      return { success: true, email: params.to };
    }

    const mailOptions: ISendMailOptions = {
      to: params.to,
      subject: params.subject,
      context: params.context,
    };

    if (params.templateName) {
      mailOptions.template = params.templateName;
    }

    if (params.resolutionResult) {
      Object.assign(mailOptions, params.resolutionResult);
    }

    const { retried, error } = await this.withRetry(
      () => this.breaker.fire(() => this.mailerService.sendMail(mailOptions)),
      `${params.logLabel} to ${params.to}`,
    );

    if (error) {
      this.logger.error(
        `Failed to send ${params.logLabel} to ${params.to} after ${this.maxRetries + 1} attempts`,
        error,
      );
      return {
        success: false,
        email: params.to,
        error: error.message,
        retried,
      };
    }

    this.logger.log(`${params.logLabel} sent to ${params.to}${retried ? ' (after retry)' : ''}`);
    return { success: true, email: params.to, retried };
  }

  async sendBookingConfirmation(data: BookingEmailData): Promise<EmailResult> {
    const templateData = await this.templateService.resolveTemplate('booking-confirmation', 'booking-confirmation', {
      clientName: data.clientName,
    });

    return this.sendEmail({
      to: data.clientEmail,
      subject: `Booking Confirmed - ${data.packageName}`,
      logLabel: 'Booking confirmation',
      resolutionResult: templateData,
      context: this.templateService.sanitizeContext(
        this.templateService.buildCommonContext({
          clientName: data.clientName,
          eventDate: this.templateService.formatDate(data.eventDate),
          packageName: data.packageName,
          totalPrice: this.templateService.formatCurrency(data.totalPrice),
          bookingId: data.bookingId,
        }),
      ),
    });
  }

  async sendTaskAssignment(data: TaskAssignmentEmailData): Promise<EmailResult> {
    return this.sendEmail({
      to: data.employeeEmail,
      subject: `New Task Assigned: ${data.taskType}`,
      logLabel: 'Task assignment',
      templateName: 'task-assignment',
      context: this.templateService.sanitizeContext(
        this.templateService.buildCommonContext({
          employeeName: data.employeeName,
          taskType: data.taskType,
          clientName: data.clientName,
          eventDate: this.templateService.formatDate(data.eventDate),
          commission: this.templateService.formatCurrency(data.commission),
        }),
      ),
    });
  }

  async sendBookingRescheduleNotification(data: BookingRescheduledStaffEmailData): Promise<EmailResult> {
    const templateData = await this.templateService.resolveTemplate(
      'booking-rescheduled-staff',
      'booking-rescheduled-staff',
      {
        employeeName: data.employeeName,
      },
    );

    return this.sendEmail({
      to: data.employeeEmail,
      subject: `Booking Rescheduled: ${data.bookingId}`,
      logLabel: 'Booking reschedule notification',
      resolutionResult: templateData,
      context: this.templateService.sanitizeContext(
        this.templateService.buildCommonContext({
          employeeName: data.employeeName,
          bookingId: data.bookingId,
          eventDate: this.templateService.formatDate(data.eventDate),
          startTime: data.startTime || 'Not specified',
        }),
      ),
    });
  }

  async sendPayrollNotification(data: PayrollEmailData): Promise<EmailResult> {
    return this.sendEmail({
      to: data.employeeEmail,
      subject: 'Payroll Processed - Payment Details',
      logLabel: 'Payroll notification',
      templateName: 'payroll-notification',
      context: this.templateService.sanitizeContext(
        this.templateService.buildCommonContext({
          employeeName: data.employeeName,
          baseSalary: this.templateService.formatCurrency(data.baseSalary),
          commission: this.templateService.formatCurrency(data.commission),
          totalPayout: this.templateService.formatCurrency(data.totalPayout),
          payrollDate: this.templateService.formatDate(data.payrollDate),
        }),
      ),
    });
  }

  async sendMagicLink(data: MagicLinkEmailData, locale = 'en'): Promise<EmailResult> {
    const portalUrl = this.configService.get<string>('CLIENT_PORTAL_URL', 'https://portal.example.com');
    const magicLinkUrl = this.buildAuthLink(portalUrl, '/auth/verify', data.token, {
      tenant: data.tenantSlug,
    });

    return this.sendEmail({
      to: data.clientEmail,
      subject: `Login to ${this.templateService.getCompanyName()} Client Portal`,
      logLabel: 'Magic link',
      templateName: 'magic-link',
      context: this.templateService.sanitizeContext(
        this.templateService.buildCommonContext({
          clientName: data.clientName,
          magicLinkUrl,
          expiresInHours: data.expiresInHours,
        }),
        locale,
      ),
    });
  }

  async sendPasswordReset(data: PasswordResetEmailData): Promise<EmailResult> {
    const appUrl = this.configService.get<string>('FRONTEND_URL', 'https://app.example.com');
    const resetUrl = this.buildAuthLink(appUrl, '/auth/reset-password', data.token);

    return this.sendEmail({
      to: data.email,
      subject: 'Reset Your Password',
      logLabel: 'Password reset',
      templateName: 'password-reset',
      context: this.templateService.sanitizeContext(
        this.templateService.buildCommonContext({
          name: data.name,
          resetUrl,
          expiresInHours: data.expiresInHours,
        }),
      ),
    });
  }

  async sendEmailVerification(data: EmailVerificationEmailData): Promise<EmailResult> {
    const appUrl = this.configService.get<string>('FRONTEND_URL', 'https://app.example.com');
    const verificationUrl = this.buildAuthLink(appUrl, '/auth/verify-email', data.token);

    return this.sendEmail({
      to: data.email,
      subject: 'Verify Your Email Address',
      logLabel: 'Email verification',
      templateName: 'email-verification',
      context: this.templateService.sanitizeContext(
        this.templateService.buildCommonContext({
          name: data.name,
          verificationUrl,
        }),
      ),
    });
  }

  async sendNewDeviceLogin(data: NewDeviceLoginEmailData): Promise<EmailResult> {
    return this.sendEmail({
      to: data.email,
      subject: 'New Login Detected',
      logLabel: 'New device login',
      templateName: 'security-alert',
      context: this.templateService.sanitizeContext(
        this.templateService.buildCommonContext({
          title: 'New Login Alert',
          name: data.name,
          alertType: 'We detected a new login on your account.',
          alertDescription: `Device: ${data.device}`,
          ipAddress: data.ipAddress,
          location: data.location || 'Unknown Location',
          time: data.time.toLocaleString(),
        }),
      ),
    });
  }

  async sendSuspiciousActivityAlert(data: SuspiciousActivityEmailData): Promise<EmailResult> {
    return this.sendEmail({
      to: data.email,
      subject: 'Security Alert: Suspicious Activity Detected',
      logLabel: 'Suspicious activity alert',
      templateName: 'security-alert',
      context: this.templateService.sanitizeContext(
        this.templateService.buildCommonContext({
          title: 'Security Alert',
          name: data.name,
          alertType: `Suspicious Activity: ${data.activityType}`,
          alertDescription: data.details,
          ipAddress: data.ipAddress,
          location: data.location || 'Unknown Location',
          time: data.time.toLocaleString(),
        }),
      ),
    });
  }

  private buildAuthLink(baseUrl: string, path: string, token: string, query: Record<string, string> = {}): string {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    const useLegacyQueryToken = this.configService.get<string>('MAIL_LEGACY_QUERY_TOKENS') === 'true';
    if (useLegacyQueryToken) {
      url.searchParams.set('token', token);
    }

    url.hash = new URLSearchParams({ token }).toString();
    return url.toString();
  }
}
