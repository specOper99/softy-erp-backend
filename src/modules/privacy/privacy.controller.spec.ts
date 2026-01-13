import { Test, TestingModule } from '@nestjs/testing';
import { User } from '../users/entities/user.entity';
import { ConsentService } from './consent.service';
import { PrivacyRequest, PrivacyRequestStatus, PrivacyRequestType } from './entities/privacy-request.entity';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';

describe('PrivacyController', () => {
  let controller: PrivacyController;
  let privacyService: jest.Mocked<PrivacyService>;
  let consentService: jest.Mocked<ConsentService>;

  const mockUser: Partial<User> = {
    id: 'user-1',
    email: 'test@example.com',
    tenantId: 'tenant-1',
  };

  const mockPrivacyRequest: Partial<PrivacyRequest> = {
    id: 'request-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    type: PrivacyRequestType.DATA_EXPORT,
    status: PrivacyRequestStatus.PENDING,
    requestedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrivacyService = {
      createRequest: jest.fn(),
      getMyRequests: jest.fn(),
      getRequestById: jest.fn(),
      cancelRequest: jest.fn(),
      processDataExport: jest.fn(),
      processDataDeletion: jest.fn(),
      getPendingRequests: jest.fn(),
    };

    const mockConsentService = {
      getConsents: jest.fn(),
      grantConsent: jest.fn(),
      revokeConsent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrivacyController],
      providers: [
        { provide: PrivacyService, useValue: mockPrivacyService },
        { provide: ConsentService, useValue: mockConsentService },
      ],
    }).compile();

    controller = module.get<PrivacyController>(PrivacyController);
    privacyService = module.get(PrivacyService);
    consentService = module.get(ConsentService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createRequest', () => {
    it('should create a privacy request', async () => {
      privacyService.createRequest.mockResolvedValue(mockPrivacyRequest as PrivacyRequest);

      const result = await controller.createRequest(mockUser as User, {
        type: PrivacyRequestType.DATA_EXPORT,
      });

      expect(privacyService.createRequest).toHaveBeenCalledWith('user-1', {
        type: PrivacyRequestType.DATA_EXPORT,
      });
      expect(result.id).toBe('request-1');
    });
  });

  describe('getMyRequests', () => {
    it('should return user privacy requests', async () => {
      privacyService.getMyRequests.mockResolvedValue([mockPrivacyRequest as PrivacyRequest]);

      const result = await controller.getMyRequests(mockUser as User);

      expect(privacyService.getMyRequests).toHaveBeenCalledWith('user-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getRequest', () => {
    it('should return a specific privacy request', async () => {
      privacyService.getRequestById.mockResolvedValue(mockPrivacyRequest as PrivacyRequest);

      const result = await controller.getRequest(mockUser as User, 'request-1');

      expect(privacyService.getRequestById).toHaveBeenCalledWith('request-1', 'user-1');
      expect(result.id).toBe('request-1');
    });
  });

  describe('cancelRequest', () => {
    it('should cancel a pending privacy request', async () => {
      const cancelledRequest = {
        ...mockPrivacyRequest,
        status: PrivacyRequestStatus.CANCELLED,
      };
      privacyService.cancelRequest.mockResolvedValue(cancelledRequest as PrivacyRequest);

      const result = await controller.cancelRequest(mockUser as User, 'request-1');

      expect(privacyService.cancelRequest).toHaveBeenCalledWith('request-1', 'user-1');
      expect(result.status).toBe(PrivacyRequestStatus.CANCELLED);
    });
  });

  describe('processExport', () => {
    it('should process a data export request', async () => {
      privacyService.processDataExport.mockResolvedValue(undefined);

      const result = await controller.processExport('request-1');

      expect(privacyService.processDataExport).toHaveBeenCalledWith('request-1');
      expect(result.message).toBe('Data export processed successfully');
    });
  });

  describe('processDeletion', () => {
    it('should process a data deletion request', async () => {
      privacyService.processDataDeletion.mockResolvedValue(undefined);

      const result = await controller.processDeletion(mockUser as User, 'request-1');

      expect(privacyService.processDataDeletion).toHaveBeenCalledWith('request-1', 'user-1');
      expect(result.message).toBe('Data deletion processed successfully');
    });
  });

  describe('getPendingRequests', () => {
    it('should return all pending privacy requests', async () => {
      privacyService.getPendingRequests.mockResolvedValue([mockPrivacyRequest as PrivacyRequest]);

      const result = await controller.getPendingRequests();

      expect(privacyService.getPendingRequests).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('getConsents', () => {
    it('should return user consents', async () => {
      const mockConsents = [{ type: 'marketing', granted: true, grantedAt: new Date() }];
      consentService.getConsents.mockResolvedValue(mockConsents as any);

      const result = await controller.getConsents(mockUser as User);

      expect(consentService.getConsents).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockConsents);
    });
  });

  describe('grantConsent', () => {
    it('should grant consent', async () => {
      const mockConsent = {
        type: 'marketing',
        granted: true,
        grantedAt: new Date(),
      };
      consentService.grantConsent.mockResolvedValue(mockConsent as any);

      const mockReq = { headers: { 'user-agent': 'test-agent' } } as any;

      const result = await controller.grantConsent(
        mockUser as User,
        { type: 'marketing' as any },
        mockReq,
        '127.0.0.1',
      );

      expect(consentService.grantConsent).toHaveBeenCalledWith(
        'user-1',
        { type: 'marketing' },
        { ipAddress: '127.0.0.1', userAgent: 'test-agent' },
      );
      expect(result).toEqual(mockConsent);
    });
  });

  describe('revokeConsent', () => {
    it('should revoke consent', async () => {
      const mockConsent = {
        type: 'marketing',
        granted: false,
        revokedAt: new Date(),
      };
      consentService.revokeConsent.mockResolvedValue(mockConsent as any);

      const result = await controller.revokeConsent(mockUser as User, 'marketing');

      expect(consentService.revokeConsent).toHaveBeenCalledWith('user-1', 'marketing');
      expect(result).toEqual(mockConsent);
    });
  });
});
