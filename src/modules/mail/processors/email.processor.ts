import { Processor, WorkerHost } from '@nestjs/bullmq';
import { forwardRef, Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MailService } from '../mail.service';

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

export type EmailJobData =
  | { type: 'booking-confirmation'; data: BookingConfirmationJobData }
  | { type: 'task-assignment'; data: TaskAssignmentJobData }
  | { type: 'payroll'; data: PayrollJobData };

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
