import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { ConsentService } from './consent.service';
import { Consent, ConsentType } from './entities/consent.entity';

jest.mock('../../common/services/tenant-context.service');

describe('ConsentService', () => {
  let service: ConsentService;
  let consentRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  const mockTenantId = 'tenant-1';
  const mockUserId = 'user-1';

  const mockConsent = {
    id: 'consent-1',
    userId: mockUserId,
    tenantId: mockTenantId,
    type: ConsentType.MARKETING,
    granted: true,
    grantedAt: new Date(),
    revokedAt: null,
    policyVersion: '1.0',
    grant: jest.fn(),
    revoke: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    (TenantContextService.getTenantId as jest.Mock).mockReturnValue(mockTenantId);

    consentRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ConsentService, { provide: getRepositoryToken(Consent), useValue: consentRepository }],
    }).compile();

    service = module.get<ConsentService>(ConsentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getConsents', () => {
    it('should return user consents', async () => {
      consentRepository.find.mockResolvedValue([mockConsent]);

      const result = await service.getConsents(mockUserId);

      expect(consentRepository.find).toHaveBeenCalledWith({
        where: { userId: mockUserId, tenantId: mockTenantId },
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(ConsentType.MARKETING);
    });

    it('should throw BadRequestException when tenant context is missing', async () => {
      (TenantContextService.getTenantId as jest.Mock).mockReturnValue(null);

      await expect(service.getConsents(mockUserId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('grantConsent', () => {
    it('should create new consent if not exists', async () => {
      const newConsent = { ...mockConsent, grant: jest.fn() };
      consentRepository.findOne.mockResolvedValue(null);
      consentRepository.create.mockReturnValue(newConsent);
      consentRepository.save.mockResolvedValue(newConsent);

      const result = await service.grantConsent(
        mockUserId,
        { type: ConsentType.MARKETING, policyVersion: '1.0' },
        { ipAddress: '127.0.0.1', userAgent: 'test-agent' },
      );

      expect(consentRepository.create).toHaveBeenCalled();
      expect(newConsent.grant).toHaveBeenCalledWith('127.0.0.1', 'test-agent', '1.0');
      expect(result.type).toBe(ConsentType.MARKETING);
    });

    it('should update existing consent', async () => {
      const existingConsent = { ...mockConsent, grant: jest.fn() };
      consentRepository.findOne.mockResolvedValue(existingConsent);
      consentRepository.save.mockResolvedValue(existingConsent);

      const result = await service.grantConsent(mockUserId, {
        type: ConsentType.MARKETING,
        policyVersion: '2.0',
      });

      expect(consentRepository.create).not.toHaveBeenCalled();
      expect(existingConsent.grant).toHaveBeenCalledWith(undefined, undefined, '2.0');
      expect(result.type).toBe(ConsentType.MARKETING);
    });

    it('should throw BadRequestException when tenant context is missing', async () => {
      (TenantContextService.getTenantId as jest.Mock).mockReturnValue(null);

      await expect(service.grantConsent(mockUserId, { type: ConsentType.MARKETING })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('revokeConsent', () => {
    it('should revoke existing consent', async () => {
      const existingConsent = {
        ...mockConsent,
        revoke: jest.fn(),
        granted: false,
        revokedAt: new Date(),
      };
      consentRepository.findOne.mockResolvedValue(existingConsent);
      consentRepository.save.mockResolvedValue(existingConsent);

      const result = await service.revokeConsent(mockUserId, ConsentType.MARKETING);

      expect(existingConsent.revoke).toHaveBeenCalled();
      expect(result.granted).toBe(false);
    });

    it('should throw BadRequestException when consent not found', async () => {
      consentRepository.findOne.mockResolvedValue(null);

      await expect(service.revokeConsent(mockUserId, ConsentType.MARKETING)).rejects.toThrow(BadRequestException);
    });
  });

  describe('hasConsent', () => {
    it('should return true when consent exists and is granted', async () => {
      consentRepository.findOne.mockResolvedValue(mockConsent);

      const result = await service.hasConsent(mockUserId, ConsentType.MARKETING);

      expect(result).toBe(true);
    });

    it('should return false when consent not found', async () => {
      consentRepository.findOne.mockResolvedValue(null);

      const result = await service.hasConsent(mockUserId, ConsentType.MARKETING);

      expect(result).toBe(false);
    });

    it('should return false when tenant context is missing', async () => {
      (TenantContextService.getTenantId as jest.Mock).mockReturnValue(null);

      const result = await service.hasConsent(mockUserId, ConsentType.MARKETING);

      expect(result).toBe(false);
    });
  });

  describe('requireConsent', () => {
    it('should not throw when consent exists', async () => {
      consentRepository.findOne.mockResolvedValue(mockConsent);

      await expect(service.requireConsent(mockUserId, ConsentType.MARKETING)).resolves.not.toThrow();
    });

    it('should throw BadRequestException when consent not granted', async () => {
      consentRepository.findOne.mockResolvedValue(null);

      await expect(service.requireConsent(mockUserId, ConsentType.MARKETING)).rejects.toThrow(BadRequestException);
    });
  });
});
