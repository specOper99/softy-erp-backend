import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { MailService } from '../mail.service';
import { EMAIL_QUEUE, EmailJobData } from '../mail.types';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { RuntimeFailure } from '../../../common/errors/runtime-failure';
import { toErrorMessage } from '../../../common/utils/error.util';

type BullmqJob = Parameters<WorkerHost['process']>[0];

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

  async process(job: BullmqJob, _token?: string): Promise<void> {
    const jobData = job.data as EmailJobData;
    this.logger.log(`Processing email job ${job.id}: ${jobData.type} `);

    // Extract tenantId from job payload (new format: job.data.data.tenantId).
    // Keep a backwards-compatible fallback for legacy payloads that placed tenantId at job.data.tenantId.
    let tenantId = '';
    const tenantIdFromData = (jobData.data as unknown as { tenantId?: unknown }).tenantId;
    if (typeof tenantIdFromData === 'string' && tenantIdFromData.trim() !== '') {
      tenantId = tenantIdFromData.trim();
    } else {
      const tenantIdFromEnvelope = (jobData as unknown as { tenantId?: unknown }).tenantId;
      if (typeof tenantIdFromEnvelope === 'string' && tenantIdFromEnvelope.trim() !== '') {
        tenantId = tenantIdFromEnvelope.trim();
      }
    }

    if (tenantId === '') {
      job.discard();
      throw new RuntimeFailure('Invalid email job payload: tenantId is required');
    }

    await TenantContextService.run(tenantId, async () => {
      try {
        switch (jobData.type) {
          case 'booking-confirmation':
            await this.mailService.sendBookingConfirmation({
              ...jobData.data,
              eventDate: new Date(jobData.data.eventDate),
            });
            break;

          case 'task-assignment':
            await this.mailService.sendTaskAssignment({
              ...jobData.data,
              eventDate: new Date(jobData.data.eventDate),
            });
            break;

          case 'payroll':
            await this.mailService.sendPayrollNotification({
              ...jobData.data,
              payrollDate: new Date(jobData.data.payrollDate),
            });
            break;

          case 'password-reset':
            await this.mailService.sendPasswordReset(jobData.data);
            break;

          case 'email-verification':
            await this.mailService.sendEmailVerification(jobData.data);
            break;

          case 'new-device-login':
            await this.mailService.sendNewDeviceLogin({
              ...jobData.data,
              time: new Date(jobData.data.time),
            });
            break;

          case 'suspicious-activity':
            await this.mailService.sendSuspiciousActivityAlert({
              ...jobData.data,
              time: new Date(jobData.data.time),
            });
            break;

          case 'booking-cancellation':
            await this.mailService.sendCancellationEmail({
              ...jobData.data,
              eventDate: new Date(jobData.data.eventDate),
              cancelledAt: new Date(jobData.data.cancelledAt),
            });
            break;

          case 'payment-receipt':
            await this.mailService.sendPaymentReceipt({
              ...jobData.data,
              eventDate: new Date(jobData.data.eventDate),
            });
            break;

          default:
            this.logger.warn(`Unknown email job type: ${(jobData as EmailJobData).type} `);
        }

        this.logger.log(`Email job ${job.id} completed successfully`);
      } catch (error) {
        this.logger.error(`Email job ${job.id} failed: ${toErrorMessage(error)} `);
        throw error; // Re-throw to trigger BullMQ retry
      }
    });
  }
}
