import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';
import { MailQueueService } from './services/mail-queue.service';
import { MailSenderService } from './services/mail-sender.service';

describe('MailService', () => {
  let service: MailService;
  let queueService: jest.Mocked<MailQueueService>;
  let senderService: jest.Mocked<MailSenderService>;

  const mockQueueService = {
    queueBookingConfirmation: jest.fn(),
    queueTaskAssignment: jest.fn(),
    queuePayrollNotification: jest.fn(),
    queuePasswordReset: jest.fn(),
    queueEmailVerification: jest.fn(),
    queueNewDeviceLogin: jest.fn(),
    queueSuspiciousActivity: jest.fn(),
  };

  const mockSenderService = {
    sendBookingConfirmation: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: MailQueueService,
          useValue: mockQueueService,
        },
        {
          provide: MailSenderService,
          useValue: mockSenderService,
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    queueService = module.get(MailQueueService);
    senderService = module.get(MailSenderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('queueBookingConfirmation', () => {
    it('should delegate to queueService', async () => {
      const data = { clientEmail: 'test@example.com' } as any;
      await service.queueBookingConfirmation(data);
      expect(queueService.queueBookingConfirmation).toHaveBeenCalledWith(data);
    });
  });

  describe('queueTaskAssignment', () => {
    it('should delegate to queueService', async () => {
      const data = { employeeEmail: 'test@example.com' } as any;
      await service.queueTaskAssignment(data);
      expect(queueService.queueTaskAssignment).toHaveBeenCalledWith(data);
    });
  });

  describe('queuePayrollNotification', () => {
    it('should delegate to queueService', async () => {
      const data = { employeeEmail: 'test@example.com' } as any;
      await service.queuePayrollNotification(data);
      expect(queueService.queuePayrollNotification).toHaveBeenCalledWith(data);
    });
  });

  describe('sendBookingConfirmation', () => {
    it('should delegate to senderService', async () => {
      const data = { clientEmail: 'test@example.com' } as any;
      await service.sendBookingConfirmation(data);
      expect(senderService.sendBookingConfirmation).toHaveBeenCalledWith(data);
    });
  });
});
