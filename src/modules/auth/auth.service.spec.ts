import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Role } from '../../common/enums';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';

describe('AuthService - Comprehensive Tests', () => {
    let service: AuthService;
    let usersService: UsersService;
    let jwtService: JwtService;

    const mockUser = {
        id: 'test-uuid-123',
        email: 'test@example.com',
        passwordHash: 'hashedPassword',
        role: Role.FIELD_STAFF,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const mockUsersService = {
        create: jest.fn(),
        findByEmail: jest.fn(),
        findOne: jest.fn(),
        validatePassword: jest.fn(),
    };

    const mockJwtService = {
        sign: jest.fn().mockReturnValue('mock-jwt-token'),
    };

    const mockConfigService = {
        get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
            if (key === 'JWT_ACCESS_EXPIRES_SECONDS') return 900;
            if (key === 'JWT_REFRESH_EXPIRES_DAYS') return 7;
            return defaultValue;
        }),
    };

    const mockRefreshTokenRepository = {
        create: jest.fn().mockImplementation((data) => ({ id: 'token-id', ...data })),
        save: jest.fn().mockImplementation((token) => Promise.resolve(token)),
        findOne: jest.fn(),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        delete: jest.fn().mockResolvedValue({ affected: 0 }),
        find: jest.fn().mockResolvedValue([]),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: UsersService, useValue: mockUsersService },
                { provide: JwtService, useValue: mockJwtService },
                { provide: ConfigService, useValue: mockConfigService },
                { provide: getRepositoryToken(RefreshToken), useValue: mockRefreshTokenRepository },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);
        usersService = module.get<UsersService>(UsersService);
        jwtService = module.get<JwtService>(JwtService);

        // Reset mocks
        jest.clearAllMocks();
    });

    // ============ REGISTRATION TESTS ============
    describe('register', () => {
        it('should register new user and return auth response', async () => {
            mockUsersService.findByEmail.mockResolvedValue(null);
            mockUsersService.create.mockResolvedValue(mockUser);

            const dto = { email: 'new@example.com', password: 'password123' };
            const result = await service.register(dto);

            expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
            expect(result).toHaveProperty('refreshToken');
            expect(result.user).toHaveProperty('email', mockUser.email);
        });

        it('should call usersService.create with dto', async () => {
            mockUsersService.findByEmail.mockResolvedValue(null);
            mockUsersService.create.mockResolvedValue(mockUser);

            const dto = { email: 'new@example.com', password: 'password123' };
            await service.register(dto);

            expect(mockUsersService.create).toHaveBeenCalledWith(dto);
        });

        it('should create user with ADMIN role when specified', async () => {
            mockUsersService.findByEmail.mockResolvedValue(null);
            mockUsersService.create.mockResolvedValue({ ...mockUser, role: Role.ADMIN });

            const dto = { email: 'admin@example.com', password: 'password123', role: Role.ADMIN };
            const result = await service.register(dto);

            expect(result.user.role).toBe(Role.ADMIN);
        });

        it('should generate JWT token with expiry option', async () => {
            mockUsersService.findByEmail.mockResolvedValue(null);
            mockUsersService.create.mockResolvedValue(mockUser);

            const dto = { email: 'new@example.com', password: 'password123' };
            await service.register(dto);

            expect(mockJwtService.sign).toHaveBeenCalledWith(
                { sub: mockUser.id, email: mockUser.email, role: mockUser.role },
                { expiresIn: 900 }
            );
        });

        it('should store refresh token in database', async () => {
            mockUsersService.findByEmail.mockResolvedValue(null);
            mockUsersService.create.mockResolvedValue(mockUser);

            const dto = { email: 'new@example.com', password: 'password123' };
            await service.register(dto);

            expect(mockRefreshTokenRepository.create).toHaveBeenCalled();
            expect(mockRefreshTokenRepository.save).toHaveBeenCalled();
        });
    });

    // ============ LOGIN TESTS ============
    describe('login', () => {
        it('should return auth response for valid credentials', async () => {
            mockUsersService.findByEmail.mockResolvedValue(mockUser);
            mockUsersService.validatePassword.mockResolvedValue(true);

            const dto = { email: 'test@example.com', password: 'password123' };
            const result = await service.login(dto);

            expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
            expect(result).toHaveProperty('refreshToken');
            expect(result.user.email).toBe(mockUser.email);
        });

        it('should throw UnauthorizedException for non-existent email', async () => {
            mockUsersService.findByEmail.mockResolvedValue(null);

            const dto = { email: 'notfound@example.com', password: 'password123' };
            await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException for incorrect password', async () => {
            mockUsersService.findByEmail.mockResolvedValue(mockUser);
            mockUsersService.validatePassword.mockResolvedValue(false);

            const dto = { email: 'test@example.com', password: 'wrongPassword' };
            await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException for inactive user', async () => {
            mockUsersService.findByEmail.mockResolvedValue({ ...mockUser, isActive: false });

            const dto = { email: 'test@example.com', password: 'password123' };
            await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
        });

        it('should return correct role in response for ADMIN', async () => {
            mockUsersService.findByEmail.mockResolvedValue({ ...mockUser, role: Role.ADMIN });
            mockUsersService.validatePassword.mockResolvedValue(true);

            const dto = { email: 'admin@example.com', password: 'password123' };
            const result = await service.login(dto);

            expect(result.user.role).toBe(Role.ADMIN);
        });
    });

    // ============ REFRESH TOKEN TESTS ============
    describe('refreshTokens', () => {
        it('should throw UnauthorizedException for invalid token', async () => {
            mockRefreshTokenRepository.findOne.mockResolvedValue(null);

            await expect(service.refreshTokens('invalid-token')).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException for expired token', async () => {
            mockRefreshTokenRepository.findOne.mockResolvedValue({
                tokenHash: 'hash',
                userId: mockUser.id,
                isRevoked: false,
                expiresAt: new Date(Date.now() - 1000), // Expired
                isExpired: () => true,
                isValid: () => false,
                user: mockUser,
            });

            await expect(service.refreshTokens('expired-token')).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException for revoked token', async () => {
            mockRefreshTokenRepository.findOne.mockResolvedValue({
                tokenHash: 'hash',
                userId: mockUser.id,
                isRevoked: true,
                expiresAt: new Date(Date.now() + 86400000),
                isExpired: () => false,
                isValid: () => false,
                user: mockUser,
            });

            await expect(service.refreshTokens('revoked-token')).rejects.toThrow(UnauthorizedException);
        });
    });

    // ============ LOGOUT TESTS ============
    describe('logout', () => {
        it('should revoke specific token', async () => {
            await service.logout(mockUser.id, 'some-refresh-token');

            expect(mockRefreshTokenRepository.update).toHaveBeenCalled();
        });

        it('should revoke all tokens when no specific token provided', async () => {
            await service.logout(mockUser.id);

            expect(mockRefreshTokenRepository.update).toHaveBeenCalledWith(
                { userId: mockUser.id, isRevoked: false },
                { isRevoked: true }
            );
        });
    });

    // ============ TOKEN VALIDATION TESTS ============
    describe('validateUser', () => {
        it('should return user for valid payload', async () => {
            mockUsersService.findOne.mockResolvedValue(mockUser);

            const payload = { sub: 'test-uuid-123', email: 'test@example.com', role: Role.FIELD_STAFF };
            const result = await service.validateUser(payload);

            expect(result).toEqual(mockUser);
        });

        it('should throw UnauthorizedException for non-existent user', async () => {
            mockUsersService.findOne.mockResolvedValue(null);

            const payload = { sub: 'invalid-id', email: 'test@example.com', role: Role.FIELD_STAFF };
            await expect(service.validateUser(payload)).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException for inactive user', async () => {
            mockUsersService.findOne.mockResolvedValue({ ...mockUser, isActive: false });

            const payload = { sub: 'test-uuid-123', email: 'test@example.com', role: Role.FIELD_STAFF };
            await expect(service.validateUser(payload)).rejects.toThrow(UnauthorizedException);
        });
    });
});
