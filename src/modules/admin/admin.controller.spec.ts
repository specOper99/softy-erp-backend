import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { AdminController } from './admin.controller';
import { KeyRotationService } from './services/key-rotation.service';

describe('AdminController', () => {
  let controller: AdminController;
  let keyRotationService: jest.Mocked<KeyRotationService>;
  let auditService: jest.Mocked<AuditService>;

  beforeEach(async () => {
    const mockKeyRotationService = {
      rotateKeys: jest.fn(),
    };

    const mockAuditService = {
      verifyChainIntegrity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: KeyRotationService, useValue: mockKeyRotationService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
    keyRotationService = module.get(KeyRotationService);
    auditService = module.get(AuditService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('rotateKeys', () => {
    it('should rotate encryption keys successfully', async () => {
      const mockResult = { processed: 10, errors: 0 };
      keyRotationService.rotateKeys.mockResolvedValue(mockResult);

      const result = await controller.rotateKeys();

      expect(keyRotationService.rotateKeys).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });

    it('should handle partial failures during rotation', async () => {
      const mockResult = { processed: 8, errors: 2 };
      keyRotationService.rotateKeys.mockResolvedValue(mockResult);

      const result = await controller.rotateKeys();

      expect(result.processed).toBe(8);
      expect(result.errors).toBe(2);
    });

    it('should propagate errors from key rotation service', async () => {
      keyRotationService.rotateKeys.mockRejectedValue(
        new Error('Rotation failed'),
      );

      await expect(controller.rotateKeys()).rejects.toThrow('Rotation failed');
    });
  });

  describe('verifyAuditChain', () => {
    it('should verify audit chain with default limit', async () => {
      const mockResult = { valid: true, totalChecked: 1000 };
      auditService.verifyChainIntegrity.mockResolvedValue(mockResult);

      const result = await controller.verifyAuditChain();

      expect(auditService.verifyChainIntegrity).toHaveBeenCalledWith(
        undefined,
        1000,
      );
      expect(result).toEqual(mockResult);
    });

    it('should verify audit chain with custom limit', async () => {
      const mockResult = { valid: true, totalChecked: 500 };
      auditService.verifyChainIntegrity.mockResolvedValue(mockResult);

      const result = await controller.verifyAuditChain(500);

      expect(auditService.verifyChainIntegrity).toHaveBeenCalledWith(
        undefined,
        500,
      );
      expect(result).toEqual(mockResult);
    });

    it('should return integrity violations when found', async () => {
      const mockResult = {
        valid: false,
        totalChecked: 100,
        brokenAt: 'entry-42',
        errorMessage: 'Chain broken at entry 42',
      };
      auditService.verifyChainIntegrity.mockResolvedValue(mockResult);

      const result = await controller.verifyAuditChain();

      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe('entry-42');
    });
  });
});
