import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, FindOneOptions, SelectQueryBuilder } from 'typeorm';
import {
  createMockQueryRunner,
  createMockRepository,
  createMockUser,
  mockTenantContext,
} from '../../../../test/helpers/mock-factories';
import { CursorAuthService } from '../../../common/services/cursor-auth.service';
import { PasswordHashService } from '../../../common/services/password-hash.service';
import { AuditPublisher } from '../../audit/audit.publisher';
import { User } from '../entities/user.entity';
import { Role } from '../enums/role.enum';
import { UserRepository } from '../repositories/user.repository';
import { UsersService } from './users.service';

// Test password constants - not real credentials, used only for unit test mocking
const TEST_PASSWORD = process.env.TEST_MOCK_PASSWORD || 'KeepTesting123!';
const TEST_WRONG_PASSWORD = process.env.TEST_MOCK_PASSWORD_WRONG || 'WrongPass123!';

describe('UsersService - Comprehensive Tests', () => {
  let service: UsersService;
  let userRepository: jest.Mocked<UserRepository>;
  let eventBus: EventBus;

  let mockUser: User;

  const mockTenantId = 'tenant-123';

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockPasswordHashService = {
    hash: jest.fn().mockImplementation((password: string) => Promise.resolve(`argon2id$${password}_hashed`)),
    verify: jest.fn().mockImplementation((hash: string, password: string) => {
      // Simple mock - check if password appears in hash
      return Promise.resolve(hash.includes(password) || hash.includes('hashed'));
    }),
    verifyAndUpgrade: jest.fn().mockImplementation((hash: string, password: string) => {
      const valid = hash.includes(password) || (hash.includes('hashed') && password === TEST_PASSWORD);
      return Promise.resolve({ valid, newHash: undefined, upgraded: false });
    }),
    needsUpgrade: jest.fn().mockReturnValue(false),
  };

  const mockCursorAuthService = {
    encode: jest.fn().mockImplementation((data: string) => Buffer.from(data).toString('base64url')),
    decode: jest.fn().mockImplementation((cursor: string) => Buffer.from(cursor, 'base64url').toString()),
    parseUserCursor: jest.fn().mockImplementation((cursor: string) => {
      try {
        const decoded = Buffer.from(cursor, 'base64url').toString();
        const [dateStr, id] = decoded.split('|');
        if (!dateStr || !id) return null;
        return { date: new Date(dateStr), id };
      } catch {
        return null;
      }
    }),
    createUserCursor: jest
      .fn()
      .mockImplementation((date: Date, id: string) => Buffer.from(`${date.toISOString()}|${id}`).toString('base64url')),
  };

  beforeEach(async () => {
    mockUser = createMockUser({
      id: 'test-uuid-123',
      tenantId: mockTenantId,
      email: 'test@example.com',
      passwordHash: 'hashedPassword',
      role: Role.FIELD_STAFF,
      isActive: true,
    }) as unknown as User;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: UserRepository,
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(User),
          useValue: createMockRepository(),
        },
        { provide: AuditPublisher, useValue: mockAuditService },
        {
          provide: EventBus,
          useValue: {
            publish: jest.fn(),
          },
        },
        { provide: PasswordHashService, useValue: mockPasswordHashService },
        { provide: CursorAuthService, useValue: mockCursorAuthService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepository = module.get(UserRepository);
    eventBus = module.get(EventBus);

    // Reset mocks
    jest.clearAllMocks();

    // Default implementations
    userRepository.find.mockResolvedValue([mockUser]);
    userRepository.save.mockImplementation((user) => Promise.resolve({ ...user, id: 'test-uuid-123' } as User));
    userRepository.softRemove.mockImplementation((user) => Promise.resolve({ ...user } as User));

    // Default findOne behavior - handle BOTH id and email lookups

    userRepository.findOne.mockImplementation((options: FindOneOptions<User>) => {
      // Safe cast for test mock logic
      const where = options.where as { id?: string; email?: string; tenantId?: string };

      if (where?.id === 'test-uuid-123') {
        return Promise.resolve(mockUser);
      }
      if (where?.email === 'test@example.com') {
        if (where?.tenantId && where?.tenantId !== mockTenantId) {
          return Promise.resolve(null);
        }
        return Promise.resolve(mockUser);
      }
      return Promise.resolve(null);
    });

    // Mock TenantContextService for tenant filter tests
    mockTenantContext(mockTenantId);
  });

  // ============ CREATE USER TESTS ============
  describe('create', () => {
    it('should create user with valid email and password', async () => {
      const dto = { email: 'new@example.com', password: TEST_PASSWORD };
      const result = await service.create(dto);
      expect(result).toHaveProperty('id');
      expect(userRepository.create).toHaveBeenCalled();
    });

    it('should hash password before saving', async () => {
      const dto = { email: 'new@example.com', password: TEST_PASSWORD };
      await service.create(dto);

      const savedUser = userRepository.create.mock.calls[0]![0];
      expect(savedUser.passwordHash).not.toBe(TEST_PASSWORD);
    });

    it('should use provided role when specified', async () => {
      const dto = {
        email: 'admin@example.com',
        password: TEST_PASSWORD,
        role: Role.ADMIN,
      };
      await service.create(dto);

      const savedUser = userRepository.create.mock.calls[0]![0];
      expect(savedUser.role).toBe(Role.ADMIN);
    });

    it('should allow creating user with OPS_MANAGER role', async () => {
      const dto = {
        email: 'ops@example.com',
        password: TEST_PASSWORD,
        role: Role.OPS_MANAGER,
      };
      await service.create(dto);

      const savedUser = userRepository.create.mock.calls[0]![0];
      expect(savedUser.role).toBe(Role.OPS_MANAGER);
    });

    it('should handle very long passwords', async () => {
      const longPassword = 'a'.repeat(100);
      const dto = { email: 'new@example.com', password: longPassword };
      const result = await service.create(dto);
      expect(result).toHaveProperty('id');
    });

    it('should create user with a manager (transactional)', async () => {
      const mockQueryRunner = createMockQueryRunner();
      // Customize create to return data (factory does this by default now)
      mockQueryRunner.manager.save.mockImplementation((data) => Promise.resolve({ id: 'managed-uuid', ...data }));

      const mockManager = mockQueryRunner.manager;

      const dto = {
        email: 'managed@example.com',
        password: TEST_PASSWORD,
        role: Role.FIELD_STAFF,
        tenantId: 'tenant-123',
      };

      const result = await service.createWithManager(mockManager as unknown as EntityManager, dto);

      expect(result).toHaveProperty('id', 'managed-uuid');
      expect(mockManager.create).toHaveBeenCalled();
      expect(mockManager.save).toHaveBeenCalled();
    });
  });

  // ============ FIND OPERATIONS TESTS ============
  describe('findAll', () => {
    it('should return all users', async () => {
      const result = await service.findAll();
      expect(result).toEqual([mockUser]);
    });

    it('should return empty array when no users exist', async () => {
      userRepository.find.mockResolvedValueOnce([]);
      const result = await service.findAll();
      expect(result).toEqual([]);
    });

    it('should return multiple users', async () => {
      const users = [mockUser, { ...mockUser, id: 'uuid-2', email: 'user2@example.com' }];
      userRepository.find.mockResolvedValueOnce(users);
      const result = await service.findAll();
      expect(result.length).toBe(2);
    });

    it('should query with relations', async () => {
      await service.findAll();
      expect(userRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['wallet'],
        }),
      );
    });

    describe('findMany', () => {
      it('should return users for given ids', async () => {
        const qbMock = {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([mockUser]),
        };
        userRepository.createQueryBuilder.mockReturnValue(qbMock as unknown as SelectQueryBuilder<User>);

        const result = await service.findMany(['test-uuid-123']);
        expect(result).toEqual([mockUser]);
        expect(qbMock.andWhere).toHaveBeenCalledWith('user.id IN (:...ids)', {
          ids: ['test-uuid-123'],
        });
      });

      it('should return empty array for empty ids', async () => {
        const result = await service.findMany([]);
        expect(result).toEqual([]);
        expect(userRepository.createQueryBuilder).not.toHaveBeenCalled();
      });

      it('should throw BadRequestException when ids array too large', async () => {
        const tooManyIds = Array.from({ length: 1001 }, (_, i) => `id-${i}`);
        await expect(service.findMany(tooManyIds)).rejects.toThrow(BadRequestException);
      });
    });
  });

  describe('findOne', () => {
    it('should return user by valid UUID', async () => {
      const result = await service.findOne('test-uuid-123');
      expect(result).toMatchObject({ id: 'test-uuid-123' });
    });

    it('should throw NotFoundException for invalid UUID', async () => {
      await expect(service.findOne('invalid-uuid')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for empty string', async () => {
      await expect(service.findOne('')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByEmail', () => {
    it('should return user by valid email within tenant', async () => {
      const result = await service.findByEmail('test@example.com', 'tenant-123');
      expect(result).toMatchObject({ email: 'test@example.com' });
    });

    it('should return null for non-existent email within tenant', async () => {
      const result = await service.findByEmail('notfound@example.com', 'tenant-123');
      expect(result).toBeNull();
    });

    it('should query by (email, tenantId)', async () => {
      await service.findByEmail('test@example.com', 'tenant-123');
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com', tenantId: 'tenant-123' },
      });
    });
  });

  // ============ UPDATE OPERATIONS TESTS ============
  describe('update', () => {
    it('should update user email', async () => {
      await service.update('test-uuid-123', {
        email: 'updated@example.com',
      });
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should update user role', async () => {
      await service.update('test-uuid-123', {
        role: Role.ADMIN,
      });
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should update user active status and log audit note', async () => {
      userRepository.findOne.mockResolvedValueOnce({
        ...mockUser,
        isActive: true,
      } as User);
      await service.update('test-uuid-123', { isActive: false });
      expect(userRepository.save).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: 'Account deactivated',
        }),
      );

      userRepository.findOne.mockResolvedValueOnce({
        ...mockUser,
        isActive: false,
      } as User);
      await service.update('test-uuid-123', { isActive: true });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: 'Account activated',
        }),
      );
    });

    it('should throw NotFoundException when updating non-existent user', async () => {
      await expect(service.update('invalid-id', { email: 'test@test.com' })).rejects.toThrow(NotFoundException);
    });
  });

  // ============ DELETE OPERATIONS TESTS ============
  describe('remove', () => {
    it('should delete existing user and publish event', async () => {
      await service.remove('test-uuid-123');
      expect(userRepository.softRemove).toHaveBeenCalled();

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-uuid-123',
          email: 'test@example.com',
        }),
      );
    });

    it('should throw NotFoundException when deleting non-existent user', async () => {
      await expect(service.remove('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });
  // ============ PASSWORD VALIDATION TESTS ============
  describe('validatePassword', () => {
    it('should return true for correct password', async () => {
      const password = TEST_PASSWORD;
      // Use bcrypt hash to simulate legacy hash that works with our mock
      mockPasswordHashService.verifyAndUpgrade.mockResolvedValueOnce({
        valid: true,
        newHash: undefined,
        upgraded: false,
      });
      const user = { ...mockUser, passwordHash: `argon2id$${password}_hashed` } as User;

      const result = await service.validatePassword(user, password);
      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      mockPasswordHashService.verifyAndUpgrade.mockResolvedValueOnce({
        valid: false,
        newHash: undefined,
        upgraded: false,
      });
      const user = { ...mockUser, passwordHash: 'somehash' } as User;

      const result = await service.validatePassword(user, TEST_WRONG_PASSWORD);
      expect(result).toBe(false);
    });

    it('should return false for empty password', async () => {
      mockPasswordHashService.verifyAndUpgrade.mockResolvedValueOnce({
        valid: false,
        newHash: undefined,
        upgraded: false,
      });
      const user = { ...mockUser, passwordHash: 'somehash' } as User;

      const result = await service.validatePassword(user, '');
      expect(result).toBe(false);
    });

    it('should handle special characters in password', async () => {
      const password = 'P@$$w0rd!#%^&*()';
      mockPasswordHashService.verifyAndUpgrade.mockResolvedValueOnce({
        valid: true,
        newHash: undefined,
        upgraded: false,
      });
      const user = { ...mockUser, passwordHash: `argon2id$hash` } as User;

      const result = await service.validatePassword(user, password);
      expect(result).toBe(true);
    });

    it('should upgrade bcrypt hash to argon2id on successful validation', async () => {
      const password = TEST_PASSWORD;
      const newArgon2Hash = '$argon2id$v=19$m=65536,t=3,p=4$...new_hash';
      mockPasswordHashService.verifyAndUpgrade.mockResolvedValueOnce({
        valid: true,
        newHash: newArgon2Hash,
        upgraded: true,
      });
      // Get the raw repo to check if it was called
      const user = { ...mockUser, passwordHash: '$2b$10$oldBcryptHash' } as User;

      const result = await service.validatePassword(user, password);
      expect(result).toBe(true);
      expect(mockPasswordHashService.verifyAndUpgrade).toHaveBeenCalledWith(user.passwordHash, password);
    });
  });
  // ============ CURSOR PAGINATION TESTS ============
  describe('findAllCursor', () => {
    let queryBuilderMock: any;

    beforeEach(() => {
      queryBuilderMock = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockUser]),
      };
      userRepository.createQueryBuilder.mockReturnValue(queryBuilderMock);
    });

    it('should return users with default limit', async () => {
      const result = await service.findAllCursor({});
      expect(result.data).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
      expect(queryBuilderMock.take).toHaveBeenCalledWith(21); // default 20 + 1
    });

    it('should handle cursor pagination', async () => {
      mockCursorAuthService.parseUserCursor.mockReturnValue({ date: new Date(), id: 'prev-id' });
      await service.findAllCursor({ cursor: 'valid-cursor', limit: 10 });
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('user.createdAt < :date'),
        expect.anything(),
      );
    });

    it('should return empty result if cursor is invalid', async () => {
      mockCursorAuthService.parseUserCursor.mockReturnValue(null);
      const result = await service.findAllCursor({ cursor: 'invalid-cursor' });
      expect(result.data).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    it('should generate nextCursor if more items exist', async () => {
      const users = Array(21)
        .fill(mockUser)
        .map((u, i) => ({ ...u, id: `user-${i}` }));
      queryBuilderMock.getMany.mockResolvedValue(users);
      mockCursorAuthService.createUserCursor.mockReturnValue('next-cursor');

      const result = await service.findAllCursor({ limit: 20 });
      expect(result.data).toHaveLength(20);
      expect(result.nextCursor).toBe('next-cursor');
    });
  });

  // ============ GLOBAL LOOKUP TESTS ============
  describe('findByEmailGlobal', () => {
    it('should return user ignoring tenant scope', async () => {
      (service['rawUserRepository'].findOne as jest.Mock).mockResolvedValue(mockUser);
      const result = await service.findByEmailGlobal('test@example.com');
      expect(result).toBe(mockUser);
      expect(service['rawUserRepository'].findOne).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
    });
  });

  // ============ MFA RELATED TESTS ============
  describe('MFA methods', () => {
    let queryBuilderMock: any;

    beforeEach(() => {
      queryBuilderMock = {
        andWhere: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ ...mockUser, mfaSecret: 'secret', mfaRecoveryCodes: ['code1'] }),
      };
      userRepository.createQueryBuilder.mockReturnValue(queryBuilderMock);
    });

    it('findByEmailWithMfaSecret should return user with secret', async () => {
      await service.findByEmailWithMfaSecret('test@example.com', 'tenant-1');
      expect(queryBuilderMock.addSelect).toHaveBeenCalledWith('user.mfaSecret');
    });

    it('findByIdWithMfaSecret should return user with secret', async () => {
      await service.findByIdWithMfaSecret('user-1');
      expect(queryBuilderMock.addSelect).toHaveBeenCalledWith('user.mfaSecret');
    });

    it('findByIdWithRecoveryCodes should return user with recovery codes', async () => {
      await service.findByIdWithRecoveryCodes('user-1');
      expect(queryBuilderMock.addSelect).toHaveBeenCalledWith('user.mfaRecoveryCodes');
    });

    it('findByIdWithRecoveryCodesGlobal should return user with recovery codes ignoring tenant', async () => {
      const rawQbMock = { ...queryBuilderMock };
      (service['rawUserRepository'].createQueryBuilder as jest.Mock).mockReturnValue(rawQbMock);

      await service.findByIdWithRecoveryCodesGlobal('user-1');
      expect(rawQbMock.addSelect).toHaveBeenCalledWith('user.mfaRecoveryCodes');
    });

    it('updateMfaSecret should update repository', async () => {
      await service.updateMfaSecret('user-1', 'new-secret', true);
      expect(userRepository.update).toHaveBeenCalledWith(
        { id: 'user-1' },
        { mfaSecret: 'new-secret', isMfaEnabled: true },
      );
    });

    it('updateMfaRecoveryCodes should update repository', async () => {
      await service.updateMfaRecoveryCodes('user-1', ['code1']);
      expect(userRepository.update).toHaveBeenCalledWith({ id: 'user-1' }, { mfaRecoveryCodes: ['code1'] });
    });
  });

  // ============ ERROR HANDLING TESTS ============
  describe('create error handling', () => {
    it('should throw ConflictException on duplicate email', async () => {
      userRepository.save.mockRejectedValue({ code: '23505' });
      await expect(service.create({ email: 'dup@example.com', password: 'p' } as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should rethrow other errors', async () => {
      userRepository.save.mockRejectedValue(new Error('db error'));
      await expect(service.create({ email: 'err@example.com', password: 'p' } as any)).rejects.toThrow('db error');
    });
  });
});
