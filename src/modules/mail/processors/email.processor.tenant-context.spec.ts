import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { MailService } from '../mail.service';
import { EmailJobData } from '../mail.types';
import { EmailProcessor } from './email.processor';
import { TenantContextService } from '../../../common/services/tenant-context.service';

describe('EmailProcessor - Tenant Context', () => {
  let processor: EmailProcessor;
  let mailService: jest.Mocked<MailService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProcessor,
        {
          provide: MailService,
          useValue: {
            sendBookingConfirmation: jest.fn().mockResolvedValue({ success: true, email: 'test@example.com' }),
            sendTaskAssignment: jest.fn().mockResolvedValue({ success: true, email: 'test@example.com' }),
            sendPayrollNotification: jest.fn().mockResolvedValue({ success: true, email: 'test@example.com' }),
            sendPasswordReset: jest.fn().mockResolvedValue({ success: true, email: 'test@example.com' }),
            sendEmailVerification: jest.fn().mockResolvedValue({ success: true, email: 'test@example.com' }),
            sendNewDeviceLogin: jest.fn().mockResolvedValue({ success: true, email: 'test@example.com' }),
            sendSuspiciousActivityAlert: jest.fn().mockResolvedValue({ success: true, email: 'test@example.com' }),
          },
        },
      ],
    }).compile();

    processor = module.get<EmailProcessor>(EmailProcessor);
    mailService = module.get(MailService);
  });

  it('should have tenant context available during booking-confirmation processing', async () => {
    const tenantId = 'test-tenant-123';
    const job = {
      id: '1',
      data: {
        type: 'booking-confirmation',
        tenantId,
        data: {
          clientName: 'John Doe',
          clientEmail: 'john@example.com',
          eventDate: '2025-06-15T10:00:00Z',
          packageName: 'Premium',
          totalPrice: 500,
          bookingId: 'booking-123',
        },
      },
    } as unknown as Job<EmailJobData & { tenantId: string }>;

    let capturedTenantId: string | undefined;
    // Mock MailService.sendBookingConfirmation to capture tenant context
    mailService.sendBookingConfirmation.mockImplementation((data) => {
      capturedTenantId = TenantContextService.getTenantId();
      return Promise.resolve({ success: true, email: data.clientEmail });
    });

    await processor.process(job);

    expect(capturedTenantId).toBe(tenantId);
    expect(mailService.sendBookingConfirmation).toHaveBeenCalled();
  });

  it('should have tenant context available during task-assignment processing', async () => {
    const tenantId = 'test-tenant-456';
    const job = {
      id: '2',
      data: {
        type: 'task-assignment',
        tenantId,
        data: {
          employeeName: 'Jane',
          employeeEmail: 'jane@example.com',
          taskType: 'Photography',
          clientName: 'Client',
          eventDate: '2025-06-15T10:00:00Z',
          commission: 100,
        },
      },
    } as unknown as Job<EmailJobData & { tenantId: string }>;

    let capturedTenantId: string | undefined;
    mailService.sendTaskAssignment.mockImplementation((data) => {
      capturedTenantId = TenantContextService.getTenantId();
      return Promise.resolve({ success: true, email: data.employeeEmail });
    });

    await processor.process(job);

    expect(capturedTenantId).toBe(tenantId);
    expect(mailService.sendTaskAssignment).toHaveBeenCalled();
  });

  it('should have tenant context available during payroll processing', async () => {
    const tenantId = 'test-tenant-789';
    const job = {
      id: '3',
      data: {
        type: 'payroll',
        tenantId,
        data: {
          employeeName: 'John',
          employeeEmail: 'john@example.com',
          baseSalary: 3000,
          commission: 500,
          totalPayout: 3500,
          payrollDate: '2025-01-01T00:00:00Z',
        },
      },
    } as unknown as Job<EmailJobData & { tenantId: string }>;

    let capturedTenantId: string | undefined;
    mailService.sendPayrollNotification.mockImplementation((data) => {
      capturedTenantId = TenantContextService.getTenantId();
      return Promise.resolve({ success: true, email: data.employeeEmail });
    });

    await processor.process(job);

    expect(capturedTenantId).toBe(tenantId);
    expect(mailService.sendPayrollNotification).toHaveBeenCalled();
  });

  it('should have tenant context available during password-reset processing', async () => {
    const tenantId = 'test-tenant-reset';
    const job = {
      id: '4',
      data: {
        type: 'password-reset',
        tenantId,
        data: {
          email: 'user@example.com',
          name: 'User',
          token: 'reset-token-123',
          expiresInHours: 1,
        },
      },
    } as unknown as Job<EmailJobData & { tenantId: string }>;

    let capturedTenantId: string | undefined;
    mailService.sendPasswordReset.mockImplementation((data) => {
      capturedTenantId = TenantContextService.getTenantId();
      return Promise.resolve({ success: true, email: data.email });
    });

    await processor.process(job);

    expect(capturedTenantId).toBe(tenantId);
    expect(mailService.sendPasswordReset).toHaveBeenCalled();
  });

  it('should have tenant context available during email-verification processing', async () => {
    const tenantId = 'test-tenant-verify';
    const job = {
      id: '5',
      data: {
        type: 'email-verification',
        tenantId,
        data: {
          email: 'user@example.com',
          name: 'User',
          token: 'verify-token-456',
        },
      },
    } as unknown as Job<EmailJobData & { tenantId: string }>;

    let capturedTenantId: string | undefined;
    mailService.sendEmailVerification.mockImplementation((data) => {
      capturedTenantId = TenantContextService.getTenantId();
      return Promise.resolve({ success: true, email: data.email });
    });

    await processor.process(job);

    expect(capturedTenantId).toBe(tenantId);
    expect(mailService.sendEmailVerification).toHaveBeenCalled();
  });

  it('should have tenant context available during new-device-login processing', async () => {
    const tenantId = 'test-tenant-device';
    const job = {
      id: '6',
      data: {
        type: 'new-device-login',
        tenantId,
        data: {
          email: 'user@example.com',
          name: 'User',
          device: 'Chrome on Windows',
          ipAddress: '192.168.1.1',
          time: '2025-01-01T12:00:00Z',
          location: 'New York, US',
        },
      },
    } as unknown as Job<EmailJobData & { tenantId: string }>;

    let capturedTenantId: string | undefined;
    mailService.sendNewDeviceLogin.mockImplementation((data) => {
      capturedTenantId = TenantContextService.getTenantId();
      return Promise.resolve({ success: true, email: data.email });
    });

    await processor.process(job);

    expect(capturedTenantId).toBe(tenantId);
    expect(mailService.sendNewDeviceLogin).toHaveBeenCalled();
  });

  it('should have tenant context available during suspicious-activity processing', async () => {
    const tenantId = 'test-tenant-suspicious';
    const job = {
      id: '7',
      data: {
        type: 'suspicious-activity',
        tenantId,
        data: {
          email: 'user@example.com',
          name: 'User',
          activityType: 'IMPOSSIBLE_TRAVEL',
          details: 'Login from different country',
          ipAddress: '192.168.1.1',
          time: '2025-01-01T12:00:00Z',
          location: 'Unknown',
        },
      },
    } as unknown as Job<EmailJobData & { tenantId: string }>;

    let capturedTenantId: string | undefined;
    mailService.sendSuspiciousActivityAlert.mockImplementation((data) => {
      capturedTenantId = TenantContextService.getTenantId();
      return Promise.resolve({ success: true, email: data.email });
    });

    await processor.process(job);

    expect(capturedTenantId).toBe(tenantId);
    expect(mailService.sendSuspiciousActivityAlert).toHaveBeenCalled();
  });
});
