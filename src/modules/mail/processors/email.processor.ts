import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MailService } from '../mail.service';
import { EMAIL_QUEUE, EmailJobData } from '../mail.types';
import { TenantContextService } from '../../../common/services/tenant-context.service';

/**
 * Email processor for handling background email jobs.
 * Processes jobs from the 'email' queue with automatic retries.
 */
@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    this.logger.log(`Processing email job ${job.id}: ${job.data.type} `);

    // Extract tenantId from job payload (new format: job.data.data.tenantId).
    // Keep a backwards-compatible fallback for legacy payloads that placed tenantId at job.data.tenantId.
    let tenantId = '';
    const tenantIdFromData = (job.data.data as unknown as { tenantId?: unknown }).tenantId;
    if (typeof tenantIdFromData === 'string' && tenantIdFromData.trim() !== '') {
      tenantId = tenantIdFromData.trim();
    } else {
      const tenantIdFromEnvelope = (job.data as unknown as { tenantId?: unknown }).tenantId;
      if (typeof tenantIdFromEnvelope === 'string' && tenantIdFromEnvelope.trim() !== '') {
        tenantId = tenantIdFromEnvelope.trim();
      }
    }

    if (tenantId === '') {
      job.discard();
      throw new Error('Invalid email job payload: tenantId is required');
    }

    await TenantContextService.run(tenantId, async () => {
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

          case 'booking-cancellation':
            await this.mailService.sendCancellationEmail({
              ...job.data.data,
              eventDate: new Date(job.data.data.eventDate),
              cancelledAt: new Date(job.data.data.cancelledAt),
            });
            break;

          case 'payment-receipt':
            await this.mailService.sendPaymentReceipt({
              ...job.data.data,
              eventDate: new Date(job.data.data.eventDate),
            });
            break;

          default:
            this.logger.warn(`Unknown email job type: ${(job.data as EmailJobData).type} `);
        }

        this.logger.log(`Email job ${job.id} completed successfully`);
      } catch (error) {
        this.logger.error(`Email job ${job.id} failed: ${error instanceof Error ? error.message : String(error)} `);
        throw error; // Re-throw to trigger BullMQ retry
      }
    });
  }
}
