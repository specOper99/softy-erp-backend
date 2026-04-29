import { ISendMailOptions, MailerService } from '@nestjs-modules/mailer';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as CircuitBreaker from 'opossum';
import pRetry from 'p-retry';
import { I18nService } from '../../../common/i18n';
import {
  BookingEmailData,
  BookingRescheduledStaffEmailData,
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
    private readonly i18n: I18nService,
    @Inject('CIRCUIT_BREAKER_MAIL')
    private readonly breaker: CircuitBreaker,
  ) {
    this.isEnabled = !!this.configService.get('MAIL_USER');
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

    let retried = false;
    const label = `${params.logLabel} to ${params.to}`;

    try {
      await pRetry(() => this.breaker.fire(() => this.mailerService.sendMail(mailOptions)), {
        retries: this.maxRetries,
        factor: 2,
        minTimeout: this.retryDelayMs,
        onFailedAttempt: (error) => {
          retried = true;
          this.logger.warn(
            `${label} failed (attempt ${error.attemptNumber}/${error.attemptNumber + error.retriesLeft}), retrying...`,
          );
        },
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to send ${label} after ${this.maxRetries + 1} attempts`, err);
      return { success: false, email: params.to, error: err.message, retried };
    }

    this.logger.log(`${label} sent${retried ? ' (after retry)' : ''}`);
    return { success: true, email: params.to, retried };
  }

  async sendBookingConfirmation(data: BookingEmailData, locale = 'en'): Promise<EmailResult> {
    const templateData = await this.templateService.resolveTemplate('booking-confirmation', 'booking-confirmation', {
      clientName: data.clientName,
    });

    return this.sendEmail({
      to: data.clientEmail,
      subject: this.i18n.translate('email.subjects.bookingConfirmed', {
        lang: locale,
        args: { packageName: data.packageName },
      }),
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
        locale,
      ),
    });
  }

  async sendTaskAssignment(data: TaskAssignmentEmailData, locale = 'en'): Promise<EmailResult> {
    return this.sendEmail({
      to: data.employeeEmail,
      subject: this.i18n.translate('email.subjects.taskAssigned', { lang: locale, args: { taskType: data.taskType } }),
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
        locale,
      ),
    });
  }

  async sendBookingRescheduleNotification(data: BookingRescheduledStaffEmailData, locale = 'en'): Promise<EmailResult> {
    const templateData = await this.templateService.resolveTemplate(
      'booking-rescheduled-staff',
      'booking-rescheduled-staff',
      {
        employeeName: data.employeeName,
      },
    );

    return this.sendEmail({
      to: data.employeeEmail,
      subject: this.i18n.translate('email.subjects.bookingRescheduled', {
        lang: locale,
        args: { bookingId: data.bookingId },
      }),
      logLabel: 'Booking reschedule notification',
      resolutionResult: templateData,
      context: this.templateService.sanitizeContext(
        this.templateService.buildCommonContext({
          employeeName: data.employeeName,
          bookingId: data.bookingId,
          eventDate: this.templateService.formatDate(data.eventDate),
          startTime: data.startTime || 'Not specified',
        }),
        locale,
      ),
    });
  }

  async sendPayrollNotification(data: PayrollEmailData, locale = 'en'): Promise<EmailResult> {
    return this.sendEmail({
      to: data.employeeEmail,
      subject: this.i18n.translate('email.subjects.payrollProcessed', { lang: locale }),
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
        locale,
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
      subject: this.i18n.translate('email.subjects.clientPortalLogin', {
        lang: locale,
        args: { companyName: this.templateService.getCompanyName() },
      }),
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

  async sendPasswordReset(data: PasswordResetEmailData, locale = 'en'): Promise<EmailResult> {
    const appUrl = this.configService.get<string>('FRONTEND_URL', 'https://app.example.com');
    const resetUrl = this.buildAuthLink(appUrl, '/auth/reset-password', data.token);

    return this.sendEmail({
      to: data.email,
      subject: this.i18n.translate('email.subjects.passwordReset', { lang: locale }),
      logLabel: 'Password reset',
      templateName: 'password-reset',
      context: this.templateService.sanitizeContext(
        this.templateService.buildCommonContext({
          name: data.name,
          resetUrl,
          expiresInHours: data.expiresInHours,
        }),
        locale,
      ),
    });
  }

  async sendEmailVerification(data: EmailVerificationEmailData, locale = 'en'): Promise<EmailResult> {
    const appUrl = this.configService.get<string>('FRONTEND_URL', 'https://app.example.com');
    const verificationUrl = this.buildAuthLink(appUrl, '/auth/verify-email', data.token);

    return this.sendEmail({
      to: data.email,
      subject: this.i18n.translate('email.subjects.emailVerification', { lang: locale }),
      logLabel: 'Email verification',
      templateName: 'email-verification',
      context: this.templateService.sanitizeContext(
        this.templateService.buildCommonContext({
          name: data.name,
          verificationUrl,
        }),
        locale,
      ),
    });
  }

  async sendNewDeviceLogin(data: NewDeviceLoginEmailData, locale = 'en'): Promise<EmailResult> {
    return this.sendEmail({
      to: data.email,
      subject: this.i18n.translate('email.subjects.newDeviceLogin', { lang: locale }),
      logLabel: 'New device login',
      templateName: 'security-alert',
      context: this.templateService.sanitizeContext(
        this.templateService.buildCommonContext({
          title: this.i18n.translate('email.content.newLoginAlert', { lang: locale }),
          name: data.name,
          alertType: this.i18n.translate('email.content.newLoginDesc', { lang: locale }),
          alertDescription: `Device: ${data.device}`,
          ipAddress: data.ipAddress,
          location: data.location || this.i18n.translate('email.content.unknownLocation', { lang: locale }),
          time: data.time.toLocaleString(),
        }),
        locale,
      ),
    });
  }

  async sendSuspiciousActivityAlert(data: SuspiciousActivityEmailData, locale = 'en'): Promise<EmailResult> {
    return this.sendEmail({
      to: data.email,
      subject: this.i18n.translate('email.subjects.suspiciousActivity', { lang: locale }),
      logLabel: 'Suspicious activity alert',
      templateName: 'security-alert',
      context: this.templateService.sanitizeContext(
        this.templateService.buildCommonContext({
          title: this.i18n.translate('email.content.securityAlert', { lang: locale }),
          name: data.name,
          alertType: this.i18n.translate('email.content.suspiciousActivityDesc', {
            lang: locale,
            args: { activityType: data.activityType },
          }),
          alertDescription: data.details,
          ipAddress: data.ipAddress,
          location: data.location || this.i18n.translate('email.content.unknownLocation', { lang: locale }),
          time: data.time.toLocaleString(),
        }),
        locale,
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
