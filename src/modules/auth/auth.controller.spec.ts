import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthResponse = {
    accessToken: 'access',
    refreshToken: 'refresh',
    user: { id: 'uuid', email: 'test@example.com', role: Role.ADMIN },
  };

  const mockUser = {
    id: 'uuid',
    email: 'admin@example.com',
    role: Role.ADMIN,
    isActive: true,
  } as User;
  const mockRequest = { headers: { 'user-agent': 'test-agent' } } as any;
  const mockIp = '127.0.0.1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn().mockResolvedValue(mockAuthResponse),
            login: jest.fn().mockResolvedValue(mockAuthResponse),
            refreshTokens: jest.fn().mockResolvedValue(mockAuthResponse),
            logout: jest.fn().mockResolvedValue(undefined),
            logoutAllSessions: jest.fn().mockResolvedValue(1),
            getActiveSessions: jest.fn().mockResolvedValue([]),
            validateUser: jest.fn().mockResolvedValue(mockUser),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should call authService.register', async () => {
      const dto = { email: 'test@example.com', password: 'password' };
      const result = await controller.register(dto, mockRequest, mockIp);
      expect(authService.register).toHaveBeenCalledWith(dto, {
        userAgent: 'test-agent',
        ipAddress: mockIp,
      });
      expect(result).toEqual(mockAuthResponse);
    });
  });

  describe('login', () => {
    it('should call authService.login', async () => {
      const dto = { email: 'test@example.com', password: 'password' };
      const result = await controller.login(dto, mockRequest, mockIp);
      expect(authService.login).toHaveBeenCalledWith(dto, {
        userAgent: 'test-agent',
        ipAddress: mockIp,
      });
      expect(result).toEqual(mockAuthResponse);
    });
  });

  describe('refreshTokens', () => {
    it('should call authService.refreshTokens', async () => {
      const result = await controller.refreshTokens(
        { refreshToken: 'old-refresh' },
        mockRequest,
        mockIp,
      );
      expect(authService.refreshTokens).toHaveBeenCalledWith('old-refresh', {
        userAgent: 'test-agent',
        ipAddress: mockIp,
      });
      expect(result).toEqual(mockAuthResponse);
    });
  });

  describe('logout', () => {
    it('should call authService.logout', async () => {
      await controller.logout(mockUser, { refreshToken: 'token' });
      expect(authService.logout).toHaveBeenCalledWith(mockUser.id, 'token');
    });

    it('should call authService.logoutAllSessions if allSessions is true', async () => {
      await controller.logout(mockUser, { allSessions: true });
      expect(authService.logoutAllSessions).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('getSessions', () => {
    it('should return active sessions', async () => {
      const result = await controller.getSessions(mockUser);
      expect(authService.getActiveSessions).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual([]);
    });
  });

  describe('getCurrentUser', () => {
    it('should return simplified user object', () => {
      const result = controller.getCurrentUser(mockUser);
      expect(result.email).toBe(mockUser.email);
    });
  });
  describe('getSessions', () => {
    it('should return active sessions', async () => {
      const mockSessions = [
        {
          id: 's1',
          userAgent: 'test',
          ipAddress: '127.0.0.1',
          createdAt: new Date(),
          lastUsedAt: new Date(),
        },
      ];
      (authService.getActiveSessions as jest.Mock).mockResolvedValue(
        mockSessions,
      );
      const result = await controller.getSessions({ id: 'u-1' } as any);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('s1');
    });
  });
});
