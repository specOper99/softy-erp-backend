import { Processor, WorkerHost } from '@nestjs/bullmq';
import { forwardRef, Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MailService } from '../mail.service';
import {
  EmailVerificationEmailData,
  NewDeviceLoginEmailData,
  PasswordResetEmailData,
  SuspiciousActivityEmailData,
} from '../mail.types';

export const EMAIL_QUEUE = 'email';

export interface BookingConfirmationJobData {
  clientName: string;
  clientEmail: string;
  eventDate: string; // ISO date string
  packageName: string;
  totalPrice: number;
  bookingId: string;
}

export interface TaskAssignmentJobData {
  employeeName: string;
  employeeEmail: string;
  taskType: string;
  clientName: string;
  eventDate: string;
  commission: number;
}

export interface PayrollJobData {
  employeeName: string;
  employeeEmail: string;
  baseSalary: number;
  commission: number;
  totalPayout: number;
  payrollDate: string;
}

export interface BookingCancellationJobData {
  clientName: string;
  to: string;
  bookingId: string;
  eventDate: string;
  cancelledAt: string;
  daysBeforeEvent: number;
  cancellationReason: string;
  amountPaid: number;
  refundAmount: number;
  refundPercentage: number;
}

export interface PaymentReceiptJobData {
  clientName: string;
  to: string;
  bookingId: string;
  eventDate: string;
  amount: number;
  paymentMethod: string;
  reference: string;
  totalPrice: number;
  amountPaid: number;
}

export type EmailJobData =
  | { type: 'booking-confirmation'; data: BookingConfirmationJobData }
  | { type: 'task-assignment'; data: TaskAssignmentJobData }
  | { type: 'payroll'; data: PayrollJobData }
  | { type: 'password-reset'; data: PasswordResetEmailData }
  | { type: 'email-verification'; data: EmailVerificationEmailData }
  | { type: 'booking-cancellation'; data: BookingCancellationJobData }
  | { type: 'payment-receipt'; data: PaymentReceiptJobData }
  | {
      type: 'new-device-login';
      data: Omit<NewDeviceLoginEmailData, 'time'> & { time: string };
    }
  | {
      type: 'suspicious-activity';
      data: Omit<SuspiciousActivityEmailData, 'time'> & { time: string };
    };

/**
 * Email processor for handling background email jobs.
 * Processes jobs from the 'email' queue with automatic retries.
 */
@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    @Inject(forwardRef(() => MailService))
    private readonly mailService: MailService,
  ) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    this.logger.log(`Processing email job ${job.id}: ${job.data.type}`);

    try {
      switch (job.data.type) {
        case 'booking-confirmation':
          await this.mailService.sendBookingConfirmation({
            ...job.data.data,
            eventDate: new Date(job.data.data.eventDate),
          });
          break;

        case 'task-assignment':
          await this.mailService.sendTaskAssignment({
            ...job.data.data,
            eventDate: new Date(job.data.data.eventDate),
          });
          break;

        case 'payroll':
          await this.mailService.sendPayrollNotification({
            ...job.data.data,
            payrollDate: new Date(job.data.data.payrollDate),
          });
          break;

        case 'password-reset':
          await this.mailService.sendPasswordReset(job.data.data);
          break;

        case 'email-verification':
          await this.mailService.sendEmailVerification(job.data.data);
          break;

        case 'new-device-login':
          await this.mailService.sendNewDeviceLogin({
            ...job.data.data,
            time: new Date(job.data.data.time),
          });
          break;

        case 'suspicious-activity':
          await this.mailService.sendSuspiciousActivityAlert({
            ...job.data.data,
            time: new Date(job.data.data.time),
          });
          break;

        default:
          this.logger.warn(
            `Unknown email job type: ${(job.data as EmailJobData).type}`,
          );
      }

      this.logger.log(`Email job ${job.id} completed successfully`);
    } catch (error) {
      this.logger.error(
        `Email job ${job.id} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error; // Re-throw to trigger BullMQ retry
    }
  }
}
