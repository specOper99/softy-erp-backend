import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { mockTenantContext } from '../../../../test/helpers/mock-factories';
import { EMAIL_QUEUE } from '../mail.types';
import { MailQueueService } from './mail-queue.service';
import { MailSenderService } from './mail-sender.service';

describe('MailQueueService', () => {
  let service: MailQueueService;
  let _emailQueue: Queue;
  let _senderService: MailSenderService;

  const mockEmailQueue = {
    add: jest.fn(),
  };

  const mockSenderService = {
    sendBookingConfirmation: jest.fn(),
    sendTaskAssignment: jest.fn(),
    sendPayrollNotification: jest.fn(),
    sendPasswordReset: jest.fn(),
    sendEmailVerification: jest.fn(),
    sendNewDeviceLogin: jest.fn(),
    sendSuspiciousActivityAlert: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContext('test-tenant-123');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailQueueService,
        {
          provide: getQueueToken(EMAIL_QUEUE),
          useValue: mockEmailQueue,
        },
        {
          provide: MailSenderService,
          useValue: mockSenderService,
        },
      ],
    }).compile();

    service = module.get<MailQueueService>(MailQueueService);
    _emailQueue = module.get<Queue>(getQueueToken(EMAIL_QUEUE));
    _senderService = module.get<MailSenderService>(MailSenderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('queueBookingConfirmation', () => {
    it('should add job to queue', async () => {
      const data: any = { eventDate: new Date() };
      await service.queueBookingConfirmation(data);
      expect(mockEmailQueue.add).toHaveBeenCalledWith('booking-confirmation', expect.any(Object), expect.any(Object));
    });
  });

  describe('queueTaskAssignment', () => {
    it('should add job to queue', async () => {
      const data: any = { eventDate: new Date() };
      await service.queueTaskAssignment(data);
      expect(mockEmailQueue.add).toHaveBeenCalledWith('task-assignment', expect.any(Object), expect.any(Object));
    });
  });

  // ... similar tests for other methods

  // Test fallback when queue is missing
  describe('fallback behavior', () => {
    let serviceNoQueue: MailQueueService;

    beforeEach(async () => {
      mockTenantContext('test-tenant-123');
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MailQueueService,
          // No queue provider
          {
            provide: MailSenderService,
            useValue: mockSenderService,
          },
        ],
      }).compile();
      serviceNoQueue = module.get<MailQueueService>(MailQueueService);
    });

    it('should call sender service directly if queue missing for booking confirmation', async () => {
      const data: any = { eventDate: new Date() };
      await serviceNoQueue.queueBookingConfirmation(data);
      expect(mockSenderService.sendBookingConfirmation).toHaveBeenCalledWith(data);
    });
  });
});
