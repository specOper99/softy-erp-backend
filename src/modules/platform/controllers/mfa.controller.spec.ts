import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PlatformUser } from '../entities/platform-user.entity';
import { MFAService } from '../services/mfa.service';
import { PlatformAuthService } from '../services/platform-auth.service';
import { MFAController } from './mfa.controller';

interface AuthenticatedRequest {
  user: {
    userId: string;
  };
}

class VerifyMFADto {
  code: string;
}

describe('MFAController', () => {
  let controller: MFAController;
  let mfaService: MFAService;
  let userRepository: any;

  const verifyTokenMock = jest.fn((_secret: string, _code: string) => false);
  const verifyBackupCodeMock = jest.fn((_code: string, _recoveryCodes: string[]) => false);
  const removeUsedBackupCodeMock = jest.fn((_code: string, recoveryCodes: string[]) => recoveryCodes);

  const mockUser = {
    id: 'user-123',
    email: 'admin@example.com',
    mfaSecret: null,
    mfaRecoveryCodes: [],
    mfaEnabled: false,
  };

  const mockMFASetup = {
    secret: 'MOCK_SECRET',
    qrCode: 'data:image/png;base64,mock',
    backupCodes: ['CODE1', 'CODE2', 'CODE3', 'CODE4', 'CODE5'],
  };

  beforeEach(async () => {
    verifyTokenMock.mockReset();
    verifyBackupCodeMock.mockReset();
    removeUsedBackupCodeMock.mockReset();

    userRepository = {
      findOne: jest.fn().mockResolvedValue({ ...mockUser }),
      save: jest.fn().mockImplementation((user) => Promise.resolve(user)),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MFAController],
      providers: [
        {
          provide: MFAService,
          useValue: {
            setupMFA: jest.fn().mockResolvedValue(mockMFASetup),
            verifyToken: verifyTokenMock,
            verifyMFACode: jest.fn(),
            verifyBackupCode: verifyBackupCodeMock,
            removeUsedBackupCode: removeUsedBackupCodeMock,
            getUserById: jest.fn().mockResolvedValue(mockUser),
            saveMfaSetup: jest.fn().mockResolvedValue(undefined),
            enableMfa: jest.fn().mockResolvedValue(undefined),
            disableMfa: jest.fn().mockResolvedValue(undefined),
            getUserWithFields: jest.fn().mockResolvedValue(mockUser),
            updateBackupCodes: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PlatformAuthService,
          useValue: {},
        },
        {
          provide: getRepositoryToken(PlatformUser),
          useValue: userRepository,
        },
      ],
    }).compile();

    controller = module.get<MFAController>(MFAController);
    mfaService = module.get<MFAService>(MFAService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setupMFA', () => {
    it('should initialize MFA setup and return QR code and backup codes', async () => {
      const mockRequest = {
        user: { userId: 'user-123' },
      } as AuthenticatedRequest;

      const result = await controller.setupMFA(mockRequest);

      expect(mfaService.setupMFA).toHaveBeenCalledWith('user-123', 'admin@example.com');
      expect(result).toEqual({
        qrCode: mockMFASetup.qrCode,
        secret: mockMFASetup.secret,
        backupCodes: mockMFASetup.backupCodes,
      });
    });

    it('should save secret and recovery codes to user', async () => {
      const mockRequest = {
        user: { userId: 'user-123' },
      } as AuthenticatedRequest;

      await controller.setupMFA(mockRequest);

      expect(mfaService.saveMfaSetup).toHaveBeenCalledWith('user-123', mockMFASetup.secret, mockMFASetup.backupCodes);
    });

    it('should throw error if user not found', async () => {
      (mfaService.getUserById as jest.Mock).mockRejectedValueOnce(new Error('User not found'));

      const mockRequest = {
        user: { userId: 'non-existent' },
      } as AuthenticatedRequest;

      await expect(controller.setupMFA(mockRequest)).rejects.toThrow('User not found');
    });
  });

  describe('verifyAndEnableMFA', () => {
    it('should verify MFA code and enable MFA', async () => {
      const userWithSecret = {
        ...mockUser,
        mfaSecret: 'TEMP_SECRET',
        mfaEnabled: false,
      };

      (mfaService.getUserById as jest.Mock).mockResolvedValueOnce(userWithSecret);
      (mfaService.verifyToken as jest.Mock).mockReturnValue(true);

      const mockRequest = {
        user: { userId: 'user-123' },
      } as AuthenticatedRequest;

      const dto = new VerifyMFADto();
      dto.code = '123456';

      const result = await controller.verifyAndEnableMFA(dto, mockRequest);

      expect(result).toEqual({
        success: true,
        message: 'MFA enabled successfully',
      });
      expect(mfaService.enableMfa).toHaveBeenCalledWith('user-123');
    });

    it('should throw error if user has no MFA secret', async () => {
      (mfaService.getUserById as jest.Mock).mockResolvedValueOnce({
        ...mockUser,
        mfaSecret: null,
      });

      const mockRequest = {
        user: { userId: 'user-123' },
      } as AuthenticatedRequest;

      const dto = new VerifyMFADto();
      dto.code = '123456';

      await expect(controller.verifyAndEnableMFA(dto, mockRequest)).rejects.toThrow('MFA not set up');
    });

    it('should reject invalid MFA code', async () => {
      (mfaService.getUserById as jest.Mock).mockResolvedValueOnce({
        ...mockUser,
        mfaSecret: 'TEMP_SECRET',
      });
      (mfaService.verifyToken as jest.Mock).mockReturnValue(false);

      const mockRequest = {
        user: { userId: 'user-123' },
      } as AuthenticatedRequest;

      const dto = new VerifyMFADto();
      dto.code = '000000';

      await expect(controller.verifyAndEnableMFA(dto, mockRequest)).rejects.toThrow('Invalid MFA code');
    });
  });

  describe('disableMFA', () => {
    it('should disable MFA with valid reason', async () => {
      const password = 'password123';

      (mfaService.disableMfa as jest.Mock).mockResolvedValueOnce(undefined);

      const mockRequest = {
        user: { userId: 'user-123' },
      } as AuthenticatedRequest;

      const dto = {
        password,
        reason: 'Device lost',
      };

      const result = await controller.disableMFA(dto, mockRequest);

      expect(result).toEqual({
        success: true,
        message: 'MFA disabled',
      });
      expect(mfaService.disableMfa).toHaveBeenCalledWith('user-123', password);
    });

    it('should throw error if user not found', async () => {
      (mfaService.disableMfa as jest.Mock).mockRejectedValueOnce(new Error('User not found'));

      const mockRequest = {
        user: { userId: 'user-123' },
      } as AuthenticatedRequest;

      const dto = {
        password: 'password123',
        reason: 'Device lost',
      };

      await expect(controller.disableMFA(dto, mockRequest)).rejects.toThrow('User not found');
    });
  });

  describe('getBackupCodes', () => {
    it('should return backup codes count', async () => {
      const userWithCodes = {
        ...mockUser,
        mfaRecoveryCodes: ['CODE1', 'CODE2', 'CODE3'],
      };

      (mfaService.getUserWithFields as jest.Mock).mockResolvedValueOnce(userWithCodes);

      const mockRequest = {
        user: { userId: 'user-123' },
      } as AuthenticatedRequest;

      const result = await controller.getBackupCodes(mockRequest);

      expect(result).toEqual({
        backupCodes: ['CODE1', 'CODE2', 'CODE3'],
        total: 3,
      });
    });

    it('should return empty array if no backup codes', async () => {
      (mfaService.getUserWithFields as jest.Mock).mockResolvedValueOnce({
        ...mockUser,
        mfaRecoveryCodes: [],
      });

      const mockRequest = {
        user: { userId: 'user-123' },
      } as AuthenticatedRequest;

      const result = await controller.getBackupCodes(mockRequest);

      expect(result).toEqual({
        backupCodes: [],
        total: 0,
      });
    });

    it('should throw error if user not found', async () => {
      (mfaService.getUserWithFields as jest.Mock).mockRejectedValueOnce(new Error('User not found'));

      const mockRequest = {
        user: { userId: 'user-123' },
      } as AuthenticatedRequest;

      await expect(controller.getBackupCodes(mockRequest)).rejects.toThrow('User not found');
    });
  });

  describe('regenerateBackupCodes', () => {
    it('should generate new backup codes', async () => {
      userRepository.findOne.mockResolvedValueOnce(mockUser);

      const mockRequest = {
        user: { userId: 'user-123' },
      } as AuthenticatedRequest;

      const result = await controller.regenerateBackupCodes(mockRequest);

      expect(mfaService.setupMFA).toHaveBeenCalledWith('user-123', 'admin@example.com');
      expect(result).toEqual({
        backupCodes: mockMFASetup.backupCodes,
        message: 'Backup codes regenerated',
      });
      expect(mfaService.updateBackupCodes).toHaveBeenCalledWith('user-123', mockMFASetup.backupCodes);
    });

    it('should throw error if user not found', async () => {
      (mfaService.getUserById as jest.Mock).mockRejectedValueOnce(new Error('User not found'));

      const mockRequest = {
        user: { userId: 'user-123' },
      } as AuthenticatedRequest;

      await expect(controller.regenerateBackupCodes(mockRequest)).rejects.toThrow('User not found');
    });
  });
});
