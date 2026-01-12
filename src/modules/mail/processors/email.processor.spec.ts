import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { MailService } from '../mail.service';
import { EmailJobData } from '../mail.types';
import { EmailProcessor } from './email.processor';

describe('EmailProcessor', () => {
  let processor: EmailProcessor;
  let mailService: jest.Mocked<MailService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProcessor,
        {
          provide: MailService,
          useValue: {
            sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
            sendTaskAssignment: jest.fn().mockResolvedValue(undefined),
            sendPayrollNotification: jest.fn().mockResolvedValue(undefined),
            sendPasswordReset: jest.fn().mockResolvedValue(undefined),
            sendEmailVerification: jest.fn().mockResolvedValue(undefined),
            sendNewDeviceLogin: jest.fn().mockResolvedValue(undefined),
            sendSuspiciousActivityAlert: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    processor = module.get<EmailProcessor>(EmailProcessor);
    mailService = module.get(MailService);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('should process booking-confirmation job', async () => {
      const job = {
        id: '1',
        data: {
          type: 'booking-confirmation',
          data: {
            clientName: 'John Doe',
            clientEmail: 'john@example.com',
            eventDate: '2025-06-15T10:00:00Z',
            packageName: 'Premium',
            totalPrice: 500,
            bookingId: 'booking-123',
          },
        },
      } as unknown as Job<EmailJobData>;

      await processor.process(job);

      expect(mailService.sendBookingConfirmation).toHaveBeenCalled();
    });

    it('should process task-assignment job', async () => {
      const job = {
        id: '2',
        data: {
          type: 'task-assignment',
          data: {
            employeeName: 'Jane',
            employeeEmail: 'jane@example.com',
            taskType: 'Photography',
            clientName: 'Client',
            eventDate: '2025-06-15T10:00:00Z',
            commission: 100,
          },
        },
      } as unknown as Job<EmailJobData>;

      await processor.process(job);

      expect(mailService.sendTaskAssignment).toHaveBeenCalled();
    });

    it('should process payroll job', async () => {
      const job = {
        id: '3',
        data: {
          type: 'payroll',
          data: {
            employeeName: 'John',
            employeeEmail: 'john@example.com',
            baseSalary: 3000,
            commission: 500,
            totalPayout: 3500,
            payrollDate: '2025-01-01T00:00:00Z',
          },
        },
      } as unknown as Job<EmailJobData>;

      await processor.process(job);

      expect(mailService.sendPayrollNotification).toHaveBeenCalled();
    });

    it('should process password-reset job', async () => {
      const job = {
        id: '4',
        data: {
          type: 'password-reset',
          data: {
            to: 'user@example.com',
            name: 'User',
            resetLink: 'https://example.com/reset',
          },
        },
      } as unknown as Job<EmailJobData>;

      await processor.process(job);

      expect(mailService.sendPasswordReset).toHaveBeenCalled();
    });

    it('should process email-verification job', async () => {
      const job = {
        id: '5',
        data: {
          type: 'email-verification',
          data: {
            to: 'user@example.com',
            name: 'User',
            verificationLink: 'https://example.com/verify',
          },
        },
      } as unknown as Job<EmailJobData>;

      await processor.process(job);

      expect(mailService.sendEmailVerification).toHaveBeenCalled();
    });

    it('should process new-device-login job', async () => {
      const job = {
        id: '6',
        data: {
          type: 'new-device-login',
          data: {
            to: 'user@example.com',
            name: 'User',
            device: 'Chrome on Windows',
            location: 'New York, US',
            ip: '192.168.1.1',
            time: '2025-01-01T12:00:00Z',
          },
        },
      } as unknown as Job<EmailJobData>;

      await processor.process(job);

      expect(mailService.sendNewDeviceLogin).toHaveBeenCalled();
    });

    it('should process suspicious-activity job', async () => {
      const job = {
        id: '7',
        data: {
          type: 'suspicious-activity',
          data: {
            to: 'user@example.com',
            name: 'User',
            activity: 'Multiple failed login attempts',
            ip: '192.168.1.1',
            location: 'Unknown',
            time: '2025-01-01T12:00:00Z',
          },
        },
      } as unknown as Job<EmailJobData>;

      await processor.process(job);

      expect(mailService.sendSuspiciousActivityAlert).toHaveBeenCalled();
    });

    it('should handle errors and rethrow', async () => {
      const error = new Error('Email sending failed');
      mailService.sendBookingConfirmation.mockRejectedValue(error);

      const job = {
        id: '8',
        data: {
          type: 'booking-confirmation',
          data: {
            clientName: 'John',
            clientEmail: 'john@example.com',
            eventDate: '2025-01-01T00:00:00Z',
            packageName: 'Basic',
            totalPrice: 100,
            bookingId: 'booking-456',
          },
        },
      } as unknown as Job<EmailJobData>;

      await expect(processor.process(job)).rejects.toThrow(
        'Email sending failed',
      );
    });
  });
});
