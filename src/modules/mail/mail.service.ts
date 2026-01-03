import { MailerService } from '@nestjs-modules/mailer';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import * as CircuitBreaker from 'opossum';
import sanitizeHtml from 'sanitize-html';
import { EMAIL_QUEUE, EmailJobData } from './processors/email.processor';

export interface BookingEmailData {
  clientName: string;
  clientEmail: string;
  eventDate: Date;
  packageName: string;
  totalPrice: number;
  bookingId: string;
}

export interface TaskAssignmentEmailData {
  employeeName: string;
  employeeEmail: string;
  taskType: string;
  clientName: string;
  eventDate: Date;
  commission: number;
}

export interface PayrollEmailData {
  employeeName: string;
  employeeEmail: string;
  baseSalary: number;
  commission: number;
  totalPayout: number;
  payrollDate: Date;
}

export interface MagicLinkEmailData {
  clientEmail: string;
  clientName: string;
  token: string;
  expiresInHours: number;
}

/**
 * Result of an email send operation
 */
export interface EmailResult {
  success: boolean;
  email: string;
  error?: string;
  retried?: boolean;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly isEnabled: boolean;
  private readonly companyName: string;
  private readonly companyUrl: string;

  private readonly maxRetries = 2;
  private readonly retryDelayMs = 1000;

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
    @Inject('CIRCUIT_BREAKER_MAIL')
    private readonly breaker: CircuitBreaker,
    @Optional()
    @InjectQueue(EMAIL_QUEUE)
    private readonly emailQueue?: Queue<EmailJobData>,
  ) {
    this.isEnabled = !!this.configService.get('MAIL_USER');
    this.companyName = this.configService.get('COMPANY_NAME', 'Soft-y');
    this.companyUrl = this.configService.get(
      'COMPANY_URL',
      'https://soft-y.com',
    );

    if (!this.isEnabled) {
      this.logger.warn('Email sending is disabled (MAIL_USER not configured)');
    }
  }

  // ==================== QUEUE METHODS (async background processing) ====================

  /**
   * Queue a booking confirmation email for background processing
   */
  async queueBookingConfirmation(data: BookingEmailData): Promise<void> {
    if (!this.emailQueue) {
      // Fallback to direct send if queue not available
      this.logger.warn('Email queue not available, sending directly');
      await this.sendBookingConfirmation(data);
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
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
    this.logger.log(
      `Queued booking confirmation email for ${data.clientEmail}`,
    );
  }

  /**
   * Queue a task assignment email for background processing
   */
  async queueTaskAssignment(data: TaskAssignmentEmailData): Promise<void> {
    if (!this.emailQueue) {
      this.logger.warn('Email queue not available, sending directly');
      await this.sendTaskAssignment(data);
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
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
    this.logger.log(`Queued task assignment email for ${data.employeeEmail}`);
  }

  /**
   * Queue a payroll notification email for background processing
   */
  async queuePayrollNotification(data: PayrollEmailData): Promise<void> {
    if (!this.emailQueue) {
      this.logger.warn('Email queue not available, sending directly');
      await this.sendPayrollNotification(data);
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
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
    this.logger.log(
      `Queued payroll notification email for ${data.employeeEmail}`,
    );
  }

  // ==================== DIRECT SEND METHODS (used by processor) ====================

  /**
   * Retry helper with exponential backoff for transient failures
   */
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
          this.logger.warn(
            `${context} failed (attempt ${attempt + 1}/${this.maxRetries + 1}), retrying in ${delay}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    return { retried, error: lastError };
  }

  async sendBookingConfirmation(data: BookingEmailData): Promise<EmailResult> {
    if (!this.isEnabled) {
      this.logger.log(
        `[DEV] Booking confirmation email to ${data.clientEmail}`,
        data,
      );
      return { success: true, email: data.clientEmail };
    }

    const { retried, error } = await this.withRetry(
      () =>
        this.breaker.fire(() =>
          this.mailerService.sendMail({
            to: data.clientEmail,
            subject: `Booking Confirmed - ${data.packageName}`,
            template: 'booking-confirmation',
            context: this.sanitizeContext({
              clientName: data.clientName,
              eventDate: this.formatDate(data.eventDate),
              packageName: data.packageName,
              totalPrice: this.formatCurrency(data.totalPrice),
              bookingId: data.bookingId,
              year: new Date().getFullYear(),
              companyName: this.companyName,
              companyUrl: this.companyUrl,
            }),
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

    this.logger.log(
      `Booking confirmation sent to ${data.clientEmail}${retried ? ' (after retry)' : ''}`,
    );
    return { success: true, email: data.clientEmail, retried };
  }

  async sendTaskAssignment(
    data: TaskAssignmentEmailData,
  ): Promise<EmailResult> {
    if (!this.isEnabled) {
      this.logger.log(
        `[DEV] Task assignment email to ${data.employeeEmail}`,
        data,
      );
      return { success: true, email: data.employeeEmail };
    }

    const { retried, error } = await this.withRetry(
      () =>
        this.breaker.fire(() =>
          this.mailerService.sendMail({
            to: data.employeeEmail,
            subject: `New Task Assigned: ${data.taskType}`,
            template: 'task-assignment',
            context: this.sanitizeContext({
              employeeName: data.employeeName,
              taskType: data.taskType,
              clientName: data.clientName,
              eventDate: this.formatDate(data.eventDate),
              commission: this.formatCurrency(data.commission),
              year: new Date().getFullYear(),
              companyName: this.companyName,
              companyUrl: this.companyUrl,
            }),
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

    this.logger.log(
      `Task assignment sent to ${data.employeeEmail}${retried ? ' (after retry)' : ''}`,
    );
    return { success: true, email: data.employeeEmail, retried };
  }

  async sendPayrollNotification(data: PayrollEmailData): Promise<EmailResult> {
    if (!this.isEnabled) {
      this.logger.log(
        `[DEV] Payroll notification email to ${data.employeeEmail}`,
        data,
      );
      return { success: true, email: data.employeeEmail };
    }

    const { retried, error } = await this.withRetry(
      () =>
        this.breaker.fire(() =>
          this.mailerService.sendMail({
            to: data.employeeEmail,
            subject: 'Payroll Processed - Payment Details',
            template: 'payroll-notification',
            context: this.sanitizeContext({
              employeeName: data.employeeName,
              baseSalary: this.formatCurrency(data.baseSalary),
              commission: this.formatCurrency(data.commission),
              totalPayout: this.formatCurrency(data.totalPayout),
              payrollDate: this.formatDate(data.payrollDate),
              year: new Date().getFullYear(),
              companyName: this.companyName,
              companyUrl: this.companyUrl,
            }),
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

    this.logger.log(
      `Payroll notification sent to ${data.employeeEmail}${retried ? ' (after retry)' : ''}`,
    );
    return { success: true, email: data.employeeEmail, retried };
  }

  async sendMagicLink(
    data: MagicLinkEmailData,
    locale = 'en',
  ): Promise<EmailResult> {
    const portalUrl = this.configService.get<string>(
      'CLIENT_PORTAL_URL',
      'https://portal.example.com',
    );
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
            subject: `Login to ${this.companyName} Client Portal`,
            template: 'magic-link',
            context: this.sanitizeContext(
              {
                clientName: data.clientName,
                magicLinkUrl,
                expiresInHours: data.expiresInHours,
                year: new Date().getFullYear(),
                companyName: this.companyName,
                companyUrl: this.companyUrl,
              },
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

    this.logger.log(
      `Magic link sent to ${data.clientEmail}${retried ? ' (after retry)' : ''}`,
    );
    return { success: true, email: data.clientEmail, retried };
  }

  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  /**
   * Recursively sanitize all string values in an object to prevent XSS in email templates
   */
  /**
   * Inject locale-specific context variables and sanitize content
   */
  private sanitizeContext(
    context: Record<string, unknown>,
    locale = 'en',
  ): Record<string, unknown> {
    const isRtl = ['ar', 'ku'].includes(locale);
    const sanitized = this.recursiveSanitize(context);

    return {
      ...sanitized,
      direction: isRtl ? 'rtl' : 'ltr',
      textAlign: isRtl ? 'right' : 'left',
      locale,
    };
  }

  /**
   * Recursively sanitize all string values in an object to prevent XSS in email templates
   */
  private recursiveSanitize<T>(context: T): T {
    if (typeof context !== 'object' || context === null) {
      if (typeof context === 'string') {
        return sanitizeHtml(context) as unknown as T;
      }
      return context;
    }

    if (Array.isArray(context)) {
      const arr = context as unknown[];
      return arr.map((item) => this.recursiveSanitize(item)) as unknown as T;
    }

    const sanitized = {} as Record<string, unknown>;
    const obj = context as Record<string, unknown>;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        sanitized[key] = this.recursiveSanitize(obj[key]);
      }
    }
    return sanitized as T;
  }
}
