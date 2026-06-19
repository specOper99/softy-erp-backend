import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as QRCode from 'qrcode';
import { PasswordHashService } from '../../../common/services/password-hash.service';
import { PlatformUser } from '../entities/platform-user.entity';
import { MFAService } from './mfa.service';
import * as totpUtil from '../../../common/utils/totp.util';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(),
}));

jest.mock('../../../common/utils/totp.util', () => ({
  buildTotp: jest.fn(),
  createTotpSecret: jest.fn(),
  verifyTotpToken: jest.fn(),
}));

describe('MFAService', () => {
  let service: MFAService;
  let userRepository: { findOne: jest.Mock; save: jest.Mock };
  let passwordHashService: { verify: jest.Mock; hash: jest.Mock; verifyAndUpgrade: jest.Mock };

  beforeEach(async () => {
    userRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    passwordHashService = {
      verify: jest.fn(),
      hash: jest.fn(),
      verifyAndUpgrade: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MFAService,
        { provide: getRepositoryToken(PlatformUser), useValue: userRepository },
        { provide: PasswordHashService, useValue: passwordHashService },
      ],
    }).compile();

    service = module.get<MFAService>(MFAService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setupMFA', () => {
    it('should generate MFA secret, QR code, and backup codes', async () => {
      const mockSecret = { base32: 'MOCK_SECRET_BASE32' };
      const mockTotp = { toString: () => 'otpauth://mock' };
      (totpUtil.createTotpSecret as jest.Mock).mockReturnValue(mockSecret);
      (totpUtil.buildTotp as jest.Mock).mockReturnValue(mockTotp);
      (QRCode.toDataURL as jest.Mock).mockResolvedValue('data:image/png;base64,mock');

      const result = await service.setupMFA('user-id', 'test@example.com');

      expect(result.secret).toBe('MOCK_SECRET_BASE32');
      expect(result.qrCode).toBe('data:image/png;base64,mock');
      expect(result.backupCodes).toHaveLength(8);
      expect(totpUtil.createTotpSecret).toHaveBeenCalled();
      expect(totpUtil.buildTotp).toHaveBeenCalledWith(mockSecret, {
        issuer: 'Platform Admin',
        label: 'test@example.com',
      });
    });
  });

  describe('verifyMFACode', () => {
    it('should throw UnauthorizedException if code is invalid', () => {
      (totpUtil.verifyTotpToken as jest.Mock).mockReturnValue(false);
      expect(() => service.verifyMFACode({ userId: 'user-id', code: '123456' }, 'secret')).toThrow(
        UnauthorizedException,
      );
    });

    it('should return true if code is valid', () => {
      (totpUtil.verifyTotpToken as jest.Mock).mockReturnValue(true);
      expect(service.verifyMFACode({ userId: 'user-id', code: '123456' }, 'secret')).toBe(true);
    });
  });

  describe('getUserById', () => {
    it('should return user if found', async () => {
      const mockUser = { id: 'user-id' } as PlatformUser;
      userRepository.findOne.mockResolvedValue(mockUser);
      const result = await service.getUserById('user-id');
      expect(result).toBe(mockUser);
    });

    it('should throw NotFoundException if user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);
      await expect(service.getUserById('user-id')).rejects.toThrow(NotFoundException);
    });
  });
});
