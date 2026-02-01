import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as QRCode from 'qrcode';
import { PlatformUser } from '../entities/platform-user.entity';
import { MFAService } from './mfa.service';

jest.mock('qrcode');
jest.mock('otpauth', () => ({
  Secret: class MockSecret {
    base32: string;
    constructor({ size: _size }: { size?: number } = {}) {
      this.base32 = 'MOCK_SECRET_KEY_123';
    }
    static fromBase32(str: string) {
      const secret = new MockSecret();
      secret.base32 = str;
      return secret;
    }
  },
  TOTP: jest.fn().mockImplementation(({ secret, ...opts }) => ({
    toString: () => `otpauth://totp/${opts.issuer}:${opts.label}?secret=${secret.base32 || secret}`,
    validate: ({ token, window: _window }: { token: string; window?: number }) => {
      // For testing: return 0 if token is '123456', null otherwise
      return token === '123456' ? 0 : null;
    },
  })),
}));

describe('MFAService', () => {
  let service: MFAService;

  beforeEach(async () => {
    const mockRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MFAService,
        {
          provide: getRepositoryToken(PlatformUser),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<MFAService>(MFAService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setupMFA', () => {
    it('should generate MFA setup with secret, QR code, and backup codes', async () => {
      const userId = 'user-123';
      const userEmail = 'admin@example.com';
      const mockQRCode = 'data:image/png;base64,mockqrcode';

      (QRCode.toDataURL as jest.Mock).mockResolvedValue(mockQRCode);

      const result = await service.setupMFA(userId, userEmail);

      expect(result.secret).toBe('MOCK_SECRET_KEY_123');
      expect(result.qrCode).toBe(mockQRCode);
      expect(result.backupCodes).toHaveLength(8);
      expect(QRCode.toDataURL).toHaveBeenCalled();
    });

    it('should generate unique backup codes', async () => {
      const userId = 'user-456';
      const userEmail = 'user@example.com';

      (QRCode.toDataURL as jest.Mock).mockResolvedValue('qrcode');

      const result = await service.setupMFA(userId, userEmail);

      const uniqueCodes = new Set(result.backupCodes);
      expect(uniqueCodes.size).toBe(result.backupCodes.length);
      expect(result.backupCodes.every((code) => code.length >= 8)).toBe(true);
    });
  });

  describe('verifyToken', () => {
    it('should verify valid TOTP token', () => {
      const secret = 'VALID_SECRET';
      const token = '123456';

      const result = service.verifyToken(secret, token);

      expect(result).toBe(true);
    });

    it('should reject invalid TOTP token', () => {
      const secret = 'VALID_SECRET';
      const token = '000000';

      const result = service.verifyToken(secret, token);

      expect(result).toBe(false);
    });

    it('should handle verification errors gracefully', () => {
      const secret = 'VALID_SECRET';
      const token = 'invalid';

      const result = service.verifyToken(secret, token);

      expect(result).toBe(false);
    });
  });

  describe('verifyMFACode', () => {
    it('should verify valid MFA code', () => {
      const input = { userId: 'user-123', code: '123456' };
      const userSecret = 'USER_SECRET';

      const result = service.verifyMFACode(input, userSecret);

      expect(result).toBe(true);
    });

    it('should throw UnauthorizedException for invalid MFA code', () => {
      const input = { userId: 'user-123', code: '000000' };
      const userSecret = 'USER_SECRET';

      expect(() => service.verifyMFACode(input, userSecret)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException with proper error message', () => {
      const input = { userId: 'user-123', code: 'wrong' };
      const userSecret = 'USER_SECRET';

      expect(() => service.verifyMFACode(input, userSecret)).toThrow('Invalid MFA code');
    });
  });

  describe('verifyBackupCode', () => {
    it('should verify valid backup code', () => {
      const providedCode = 'ABC12345';
      const storedCodes = ['ABC12345', 'DEF67890', 'GHI11111'];

      const result = service.verifyBackupCode(providedCode, storedCodes);

      expect(result).toBe(true);
    });

    it('should verify backup code case-insensitively', () => {
      const providedCode = 'abc12345';
      const storedCodes = ['ABC12345', 'DEF67890', 'GHI11111'];

      const result = service.verifyBackupCode(providedCode, storedCodes);

      expect(result).toBe(true);
    });

    it('should verify backup code with trimmed whitespace', () => {
      const providedCode = '  ABC12345  ';
      const storedCodes = ['ABC12345', 'DEF67890', 'GHI11111'];

      const result = service.verifyBackupCode(providedCode, storedCodes);

      expect(result).toBe(true);
    });

    it('should reject invalid backup code', () => {
      const providedCode = 'INVALID';
      const storedCodes = ['ABC12345', 'DEF67890', 'GHI11111'];

      const result = service.verifyBackupCode(providedCode, storedCodes);

      expect(result).toBe(false);
    });

    it('should return false for empty backup codes list', () => {
      const providedCode = 'ABC12345';
      const storedCodes: string[] = [];

      const result = service.verifyBackupCode(providedCode, storedCodes);

      expect(result).toBe(false);
    });
  });

  describe('removeUsedBackupCode', () => {
    it('should remove used backup code', () => {
      const usedCode = 'ABC12345';
      const storedCodes = ['ABC12345', 'DEF67890', 'GHI11111'];

      const result = service.removeUsedBackupCode(usedCode, storedCodes);

      expect(result).toEqual(['DEF67890', 'GHI11111']);
      expect(result).not.toContain('ABC12345');
    });

    it('should remove backup code case-insensitively', () => {
      const usedCode = 'abc12345';
      const storedCodes = ['ABC12345', 'DEF67890', 'GHI11111'];

      const result = service.removeUsedBackupCode(usedCode, storedCodes);

      expect(result).toEqual(['DEF67890', 'GHI11111']);
    });

    it('should remove backup code with trimmed whitespace', () => {
      const usedCode = '  ABC12345  ';
      const storedCodes = ['ABC12345', 'DEF67890', 'GHI11111'];

      const result = service.removeUsedBackupCode(usedCode, storedCodes);

      expect(result).toEqual(['DEF67890', 'GHI11111']);
    });

    it('should handle non-existent backup code gracefully', () => {
      const usedCode = 'NONEXISTENT';
      const storedCodes = ['ABC12345', 'DEF67890', 'GHI11111'];

      const result = service.removeUsedBackupCode(usedCode, storedCodes);

      expect(result).toEqual(storedCodes);
    });

    it('should handle empty codes list', () => {
      const usedCode = 'ABC12345';
      const storedCodes: string[] = [];

      const result = service.removeUsedBackupCode(usedCode, storedCodes);

      expect(result).toEqual([]);
    });
  });
});
