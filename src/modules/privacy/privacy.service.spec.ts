import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventBus } from '@nestjs/cqrs';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { BookingRepository } from '../bookings/repositories/booking.repository';
import { TransactionRepository } from '../finance/repositories/transaction.repository';
import { ProfileRepository } from '../hr/repositories/profile.repository';
import { StorageService } from '../media/storage.service';
import { TaskRepository } from '../tasks/repositories/task.repository';
import { UserRepository } from '../users/repositories/user.repository';
import { PrivacyRequest, PrivacyRequestStatus, PrivacyRequestType } from './entities/privacy-request.entity';
import { PrivacyService } from './privacy.service';

jest.mock('../../common/services/tenant-context.service');

describe('PrivacyService', () => {
  let service: PrivacyService;
  let privacyRequestRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let userRepository: { findOne: jest.Mock; update: jest.Mock };
  let profileRepository: { findOne: jest.Mock; update: jest.Mock };
  let bookingRepository: { find: jest.Mock };
  let taskRepository: { find: jest.Mock };
  let transactionRepository: { find: jest.Mock };
  let storageService: {
    uploadFile: jest.Mock;
    getPresignedDownloadUrl: jest.Mock;
  };

  const mockTenantId = 'tenant-1';

  beforeEach(() => {
    jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockReturnValue(mockTenantId);
  });
  const mockUserId = 'user-1';

  const mockPrivacyRequest = {
    id: 'request-1',
    userId: mockUserId,
    tenantId: mockTenantId,
    type: PrivacyRequestType.DATA_EXPORT,
    status: PrivacyRequestStatus.PENDING,
    requestedAt: new Date(),
    startProcessing: jest.fn(),
    complete: jest.fn(),
    fail: jest.fn(),
    cancel: jest.fn(),
  };

  const _mockUser = {
    id: mockUserId,
    email: 'test@example.com',
    role: 'user',
    isActive: true,
    emailVerified: true,
    isMfaEnabled: false,
    createdAt: new Date(),
    tenantId: mockTenantId,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    (TenantContextService.getTenantId as jest.Mock).mockReturnValue(mockTenantId);

    privacyRequestRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    userRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
    };

    profileRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
    };

    bookingRepository = {
      find: jest.fn(),
    };

    taskRepository = {
      find: jest.fn(),
    };

    transactionRepository = {
      find: jest.fn(),
    };

    storageService = {
      uploadFile: jest.fn(),
      getPresignedDownloadUrl: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrivacyService,
        {
          provide: getRepositoryToken(PrivacyRequest),
          useValue: privacyRequestRepository,
        },
        { provide: UserRepository, useValue: userRepository },
        { provide: BookingRepository, useValue: bookingRepository },
        { provide: TaskRepository, useValue: taskRepository },
        { provide: TransactionRepository, useValue: transactionRepository },
        { provide: ProfileRepository, useValue: profileRepository },
        { provide: StorageService, useValue: storageService },
        {
          provide: EventBus,
          useValue: {
            publish: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PrivacyService>(PrivacyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRequest', () => {
    it('should create a privacy request', async () => {
      privacyRequestRepository.findOne.mockResolvedValue(null);
      privacyRequestRepository.create.mockReturnValue(mockPrivacyRequest);
      privacyRequestRepository.save.mockResolvedValue(mockPrivacyRequest);

      const result = await service.createRequest(mockUserId, {
        type: PrivacyRequestType.DATA_EXPORT,
      });

      expect(result.type).toBe(PrivacyRequestType.DATA_EXPORT);
      expect(privacyRequestRepository.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException when pending request exists', async () => {
      privacyRequestRepository.findOne.mockResolvedValue(mockPrivacyRequest);

      await expect(
        service.createRequest(mockUserId, {
          type: PrivacyRequestType.DATA_EXPORT,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when tenant context is missing', async () => {
      jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockImplementation(() => {
        throw new BadRequestException('Tenant context missing');
      });

      await expect(
        service.createRequest(mockUserId, {
          type: PrivacyRequestType.DATA_EXPORT,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMyRequests', () => {
    it('should return user privacy requests', async () => {
      privacyRequestRepository.find.mockResolvedValue([mockPrivacyRequest]);

      const result = await service.getMyRequests(mockUserId);

      expect(result).toHaveLength(1);
      expect(privacyRequestRepository.find).toHaveBeenCalledWith({
        where: { userId: mockUserId, tenantId: mockTenantId },
        order: { requestedAt: 'DESC' },
        take: 100,
      });
    });
  });

  describe('getRequestById', () => {
    it('should return a specific privacy request', async () => {
      privacyRequestRepository.findOne.mockResolvedValue(mockPrivacyRequest);

      const result = await service.getRequestById('request-1', mockUserId);

      expect(result.id).toBe('request-1');
    });

    it('should throw NotFoundException when request not found', async () => {
      privacyRequestRepository.findOne.mockResolvedValue(null);

      await expect(service.getRequestById('nonexistent', mockUserId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelRequest', () => {
    it('should cancel a pending request', async () => {
      const pendingRequest = {
        ...mockPrivacyRequest,
        status: PrivacyRequestStatus.PENDING,
        cancel: jest.fn(),
      };
      privacyRequestRepository.findOne.mockResolvedValue(pendingRequest);
      privacyRequestRepository.save.mockResolvedValue(pendingRequest);

      await service.cancelRequest('request-1', mockUserId);

      expect(pendingRequest.cancel).toHaveBeenCalled();
    });

    it('should throw BadRequestException for non-pending requests', async () => {
      const completedRequest = {
        ...mockPrivacyRequest,
        status: PrivacyRequestStatus.COMPLETED,
      };
      privacyRequestRepository.findOne.mockResolvedValue(completedRequest);

      await expect(service.cancelRequest('request-1', mockUserId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getPendingRequests', () => {
    it('should return all pending requests', async () => {
      privacyRequestRepository.find.mockResolvedValue([mockPrivacyRequest]);

      const result = await service.getPendingRequests();

      expect(result).toHaveLength(1);
      expect(privacyRequestRepository.find).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId, status: PrivacyRequestStatus.PENDING },
        order: { requestedAt: 'ASC' },
        relations: ['user'],
        take: 100,
      });
    });
  });
});
