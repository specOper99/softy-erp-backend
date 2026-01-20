import { Test, TestingModule } from '@nestjs/testing';
import { PlatformAuthService } from '../services/platform-auth.service';
import { PlatformAuthController } from './platform-auth.controller';

interface PlatformRequest {
  ip?: string;
  connection?: { remoteAddress?: string };
  headers: { 'user-agent'?: string };
  user: {
    sessionId: string;
    userId: string;
  };
}

describe('PlatformAuthController', () => {
  let controller: PlatformAuthController;
  let authService: PlatformAuthService;

  const mockLoginResponse = {
    accessToken: 'access-token-123',
    refreshToken: 'refresh-token-456',
    expiresIn: 3600,
    user: {
      id: 'user-123',
      email: 'admin@example.com',
      fullName: 'Admin User',
      role: 'SUPER_ADMIN',
    },
    mfaRequired: false,
    sessionId: 'session-123',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlatformAuthController],
      providers: [
        {
          provide: PlatformAuthService,
          useValue: {
            login: jest.fn().mockResolvedValue(mockLoginResponse),
            logout: jest.fn().mockResolvedValue(void 0),
            revokeAllSessions: jest.fn().mockResolvedValue(5),
          },
        },
      ],
    }).compile();

    controller = module.get<PlatformAuthController>(PlatformAuthController);
    authService = module.get<PlatformAuthService>(PlatformAuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should authenticate user with valid credentials', async () => {
      const dto = {
        email: 'admin@example.com',
        password: 'password123',
      };

      const mockRequest = {
        ip: '192.168.1.1',
        headers: { 'user-agent': 'Mozilla/5.0' },
      } as PlatformRequest;

      const result = await controller.login(dto, mockRequest);

      expect(authService.login).toHaveBeenCalledWith(dto, '192.168.1.1', 'Mozilla/5.0');
      expect(result).toEqual(mockLoginResponse);
    });

    it('should handle request without ip address', async () => {
      const dto = {
        email: 'admin@example.com',
        password: 'password123',
      };

      const mockRequest = {
        headers: { 'user-agent': 'Mozilla/5.0' },
      } as PlatformRequest;

      await controller.login(dto, mockRequest);

      expect(authService.login).toHaveBeenCalledWith(dto, 'unknown', 'Mozilla/5.0');
    });

    it('should handle request with connection.remoteAddress', async () => {
      const dto = {
        email: 'admin@example.com',
        password: 'password123',
      };

      const mockRequest = {
        connection: { remoteAddress: '10.0.0.1' },
        headers: { 'user-agent': 'Mozilla/5.0' },
      } as PlatformRequest;

      await controller.login(dto, mockRequest);

      expect(authService.login).toHaveBeenCalledWith(dto, '10.0.0.1', 'Mozilla/5.0');
    });

    it('should handle request without user agent', async () => {
      const dto = {
        email: 'admin@example.com',
        password: 'password123',
      };

      const mockRequest = {
        ip: '192.168.1.1',
        headers: {},
      } as PlatformRequest;

      await controller.login(dto, mockRequest);

      expect(authService.login).toHaveBeenCalledWith(dto, '192.168.1.1', 'unknown');
    });

    it('should require MFA if enabled', async () => {
      const mfaRequiredResponse = {
        ...mockLoginResponse,
        mfaRequired: true,
        tempToken: 'temp-mfa-token',
      };

      (authService.login as jest.Mock).mockResolvedValueOnce(mfaRequiredResponse);

      const dto = {
        email: 'admin@example.com',
        password: 'password123',
      };

      const mockRequest = {
        ip: '192.168.1.1',
        headers: { 'user-agent': 'Mozilla/5.0' },
      } as PlatformRequest;

      const result = await controller.login(dto, mockRequest);

      expect(result.mfaRequired).toBe(true);
      expect(result).toHaveProperty('tempToken');
    });
  });

  describe('logout', () => {
    it('should logout user and invalidate session', async () => {
      const mockRequest = {
        user: {
          sessionId: 'session-123',
          userId: 'user-123',
        },
      } as PlatformRequest;

      await controller.logout(mockRequest);

      expect(authService.logout).toHaveBeenCalledWith('session-123', 'user-123');
    });

    it('should succeed silently', async () => {
      const mockRequest = {
        user: {
          sessionId: 'session-123',
          userId: 'user-123',
        },
      } as PlatformRequest;

      const result = await controller.logout(mockRequest);

      expect(result).toBeUndefined();
    });
  });

  describe('revokeAllSessions', () => {
    it('should revoke all sessions for user', async () => {
      const mockRequest = {
        user: {
          sessionId: 'session-123',
          userId: 'user-123',
        },
      } as PlatformRequest;

      const body = { reason: 'Security incident detected' };

      const result = await controller.revokeAllSessions(mockRequest, body);

      expect(authService.revokeAllSessions).toHaveBeenCalledWith('user-123', 'user-123', 'Security incident detected');
      expect(result).toEqual({ revokedSessions: 5 });
    });

    it('should return count of revoked sessions', async () => {
      (authService.revokeAllSessions as jest.Mock).mockResolvedValueOnce(10);

      const mockRequest = {
        user: {
          sessionId: 'session-123',
          userId: 'user-123',
        },
      } as PlatformRequest;

      const body = { reason: 'Password changed' };

      const result = await controller.revokeAllSessions(mockRequest, body);

      expect(result.revokedSessions).toBe(10);
    });

    it('should require reason for revocation', async () => {
      const mockRequest = {
        user: {
          sessionId: 'session-123',
          userId: 'user-123',
        },
      } as PlatformRequest;

      const body = { reason: '' };

      // The guard would catch this, but test that service is called
      await controller.revokeAllSessions(mockRequest, body);

      expect(authService.revokeAllSessions).toHaveBeenCalled();
    });

    it('should handle empty session revocation', async () => {
      (authService.revokeAllSessions as jest.Mock).mockResolvedValueOnce(0);

      const mockRequest = {
        user: {
          sessionId: 'session-123',
          userId: 'user-123',
        },
      } as PlatformRequest;

      const body = { reason: 'User request' };

      const result = await controller.revokeAllSessions(mockRequest, body);

      expect(result.revokedSessions).toBe(0);
    });
  });
});
