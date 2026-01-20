import { Test, TestingModule } from '@nestjs/testing';
import { authenticator } from 'otplib';
import { PasswordHashService } from '../../../common/services/password-hash.service';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/services/users.service';
import { MfaService } from './mfa.service';

jest.mock('QRCode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockcode'),
}));

describe('MfaService', () => {
  let service: MfaService;
  let usersService: jest.Mocked<UsersService>;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    tenantId: 'tenant-1',
    mfaSecret: 'secret',
  } as User;

  beforeEach(async () => {
    const mockUsersService = {
      updateMfaSecret: jest.fn(),
      findByEmailWithMfaSecret: jest.fn(),
      updateMfaRecoveryCodes: jest.fn(),
      findByIdWithRecoveryCodes: jest.fn(),
    };

    const mockPasswordHashService = {
      hash: jest.fn().mockImplementation((password: string) => Promise.resolve(`argon2id$${password}_hashed`)),
      verify: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: PasswordHashService,
          useValue: mockPasswordHashService,
        },
      ],
    }).compile();

    service = module.get<MfaService>(MfaService);
    usersService = module.get(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateMfaSecret', () => {
    it('should generate a secret and qr code', async () => {
      const result = await service.generateMfaSecret(mockUser);
      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('qrCodeUrl');
      expect(usersService.updateMfaSecret).toHaveBeenCalledWith(mockUser.id, expect.any(String), false);
    });
  });

  describe('enableMfa', () => {
    it('should enable MFA if code is valid', async () => {
      const secret = authenticator.generateSecret();
      const token = authenticator.generate(secret);

      usersService.findByEmailWithMfaSecret.mockResolvedValue({
        ...mockUser,
        mfaSecret: secret,
      } as User);

      // Mock generateRecoveryCodes internal call
      // Since generateRecoveryCodes is public, we can spy on it?
      // Or just let it run. It calls usersService.updateMfaRecoveryCodes

      const result = await service.enableMfa(mockUser, token);

      expect(usersService.findByEmailWithMfaSecret).toHaveBeenCalledWith(mockUser.email, mockUser.tenantId);
      expect(usersService.updateMfaSecret).toHaveBeenCalledWith(mockUser.id, secret, true);
      expect(result).toHaveLength(10); // 10 recovery codes
    });

    it('should throw Unauthorized if code is invalid', async () => {
      const secret = authenticator.generateSecret();
      usersService.findByEmailWithMfaSecret.mockResolvedValue({
        ...mockUser,
        mfaSecret: secret,
      } as User);

      await expect(service.enableMfa(mockUser, '000000')).rejects.toThrow('Invalid MFA code');
    });
  });

  describe('generateRecoveryCodes', () => {
    it('should generate and hash recovery codes', async () => {
      const codes = await service.generateRecoveryCodes(mockUser);
      expect(codes).toHaveLength(10);
      expect(usersService.updateMfaRecoveryCodes).toHaveBeenCalled();

      // Verify hashing happens - now uses Argon2id instead of bcrypt
      const callArgs = usersService.updateMfaRecoveryCodes.mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs![0]).toBe(mockUser.id);
      expect(Array.isArray(callArgs![1])).toBe(true);
      expect(callArgs![1]).toHaveLength(10);
      // Hashes should be different from plain text (Argon2id hashed)
      expect(callArgs![1][0]).not.toBe(codes[0]);
    });
  });
});
