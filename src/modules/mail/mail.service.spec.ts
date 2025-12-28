import { MailerService } from '@nestjs-modules/mailer';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  let mailerService: MailerService;
  let configService: ConfigService;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  const mockMailerService = {
    sendMail: jest.fn().mockResolvedValue({}),
  };

  const mockConfig: Record<string, string | null> = {
    MAIL_USER: 'test@example.com',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: MailerService,
          useValue: mockMailerService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => mockConfig[key]),
          },
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    mailerService = module.get<MailerService>(MailerService);
    configService = module.get<ConfigService>(ConfigService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendBookingConfirmation', () => {
    const data = {
      clientName: 'John Doe',
      clientEmail: 'john@example.com',
      eventDate: new Date('2023-01-01'),
      packageName: 'Premium',
      totalPrice: 1000,
      bookingId: 'b-123',
    };

    it('should send email if enabled', async () => {
      await service.sendBookingConfirmation(data);
      expect(mailerService.sendMail).toHaveBeenCalled();
    });

    it('should not send email if disabled', async () => {
      mockConfig['MAIL_USER'] = null;
      const disabledService = new MailService(mailerService, configService);

      await disabledService.sendBookingConfirmation(data);
      expect(mailerService.sendMail).not.toHaveBeenCalled();
      // Restore for other tests
      mockConfig['MAIL_USER'] = 'test@example.com';
    });

    it('should catch and log errors', async () => {
      mockMailerService.sendMail.mockRejectedValueOnce(
        new Error('Send failed'),
      );
      await expect(
        service.sendBookingConfirmation(data),
      ).resolves.not.toThrow();
    });

    it('should handle isEnabled false for all notification types', async () => {
      (service as any).isEnabled = false;
      const logSpy = jest.spyOn((service as any).logger, 'log');

      await service.sendBookingConfirmation({
        clientEmail: 'test@test.com',
      } as any);
      await service.sendTaskAssignment({
        employeeEmail: 'test@test.com',
      } as any);
      await service.sendPayrollNotification({
        employeeEmail: 'test@test.com',
      } as any);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEV]'),
        expect.any(Object),
      );
    });
  });

  describe('sendTaskAssignment', () => {
    const data = {
      employeeName: 'Staff',
      employeeEmail: 'staff@example.com',
      taskType: 'Photoshoot',
      clientName: 'Client',
      eventDate: new Date('2023-01-01'),
      commission: 100,
    };

    it('should send email if enabled', async () => {
      await service.sendTaskAssignment(data);
      expect(mailerService.sendMail).toHaveBeenCalled();
    });

    it('should catch and log errors', async () => {
      mockMailerService.sendMail.mockRejectedValueOnce(
        new Error('Send failed'),
      );
      await expect(service.sendTaskAssignment(data)).resolves.not.toThrow();
    });
  });

  describe('sendPayrollNotification', () => {
    const data = {
      employeeName: 'Staff',
      employeeEmail: 'staff@example.com',
      baseSalary: 500,
      commission: 100,
      totalPayout: 600,
      payrollDate: new Date('2023-01-01'),
    };

    it('should send email if enabled', async () => {
      await service.sendPayrollNotification(data);
      expect(mailerService.sendMail).toHaveBeenCalled();
    });

    it('should catch and log errors', async () => {
      mockMailerService.sendMail.mockRejectedValueOnce(
        new Error('Send failed'),
      );
      await expect(
        service.sendPayrollNotification(data),
      ).resolves.not.toThrow();
    });
  });
});
