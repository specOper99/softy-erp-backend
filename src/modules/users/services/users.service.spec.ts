import { NotFoundException } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { EntityManager } from 'typeorm';
import { createMockRepository, createMockUser, mockTenantContext } from '../../../../test/helpers/mock-factories';
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

  let mockUser: User;

  const mockTenantId = 'tenant-123';

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
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
        { provide: AuditPublisher, useValue: mockAuditService },
        {
          provide: EventBus,
          useValue: {
            publish: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepository = module.get(UserRepository);

    // Reset mocks
    jest.clearAllMocks();

    // Default implementations
    userRepository.find.mockResolvedValue([mockUser]);
    userRepository.save.mockImplementation((user) => Promise.resolve({ ...user, id: 'test-uuid-123' } as User));
    userRepository.softRemove.mockImplementation((user) => Promise.resolve({ ...user } as User));

    // Default findOne behavior - handle BOTH id and email lookups
    userRepository.findOne.mockImplementation((options: any) => {
      const { where } = options;
      if (where.id === 'test-uuid-123') {
        return Promise.resolve(mockUser);
      }
      if (where.email === 'test@example.com') {
        if (where.tenantId && where.tenantId !== mockTenantId) {
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

      const savedUser = userRepository.create.mock.calls[0][0];
      expect(savedUser.passwordHash).not.toBe(TEST_PASSWORD);
    });

    it('should use provided role when specified', async () => {
      const dto = {
        email: 'admin@example.com',
        password: TEST_PASSWORD,
        role: Role.ADMIN,
      };
      await service.create(dto);

      const savedUser = userRepository.create.mock.calls[0][0];
      expect(savedUser.role).toBe(Role.ADMIN);
    });

    it('should allow creating user with OPS_MANAGER role', async () => {
      const dto = {
        email: 'ops@example.com',
        password: TEST_PASSWORD,
        role: Role.OPS_MANAGER,
      };
      await service.create(dto);

      const savedUser = userRepository.create.mock.calls[0][0];
      expect(savedUser.role).toBe(Role.OPS_MANAGER);
    });

    it('should handle very long passwords', async () => {
      const longPassword = 'a'.repeat(100);
      const dto = { email: 'new@example.com', password: longPassword };
      const result = await service.create(dto);
      expect(result).toHaveProperty('id');
    });

    it('should create user with a manager (transactional)', async () => {
      const mockManager = {
        create: jest.fn().mockImplementation((_entity, data) => data),
        save: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'managed-uuid', ...data })),
      } as unknown as EntityManager;

      const dto = {
        email: 'managed@example.com',
        password: TEST_PASSWORD,
        role: Role.FIELD_STAFF,
        tenantId: 'tenant-123',
      };

      const result = await service.createWithManager(mockManager, dto);

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
        userRepository.createQueryBuilder.mockReturnValue(qbMock as any);

        const result = await service.findMany(['test-uuid-123']);
        expect(result).toEqual([mockUser]);
        expect(qbMock.where).toHaveBeenCalledWith('user.id IN (:...ids)', {
          ids: ['test-uuid-123'],
        });
      });

      it('should return empty array for empty ids', async () => {
        const result = await service.findMany([]);
        expect(result).toEqual([]);
        expect(userRepository.createQueryBuilder).not.toHaveBeenCalled();
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
    it('should return user by valid email', async () => {
      const result = await service.findByEmail('test@example.com');
      expect(result).toMatchObject({ email: 'test@example.com' });
    });

    it('should return null for non-existent email', async () => {
      const result = await service.findByEmail('notfound@example.com');
      expect(result).toBeNull();
    });

    it('should filter by tenantId when provided', async () => {
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
      const eventBus = (service as any).eventBus;
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
      const hash = await bcrypt.hash(password, 10);
      const user = { ...mockUser, passwordHash: hash } as User;

      const result = await service.validatePassword(user, password);
      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const hash = await bcrypt.hash(TEST_PASSWORD, 10);
      const user = { ...mockUser, passwordHash: hash } as User;

      const result = await service.validatePassword(user, TEST_WRONG_PASSWORD);
      expect(result).toBe(false);
    });

    it('should return false for empty password', async () => {
      const hash = await bcrypt.hash(TEST_PASSWORD, 10);
      const user = { ...mockUser, passwordHash: hash } as User;

      const result = await service.validatePassword(user, '');
      expect(result).toBe(false);
    });

    it('should handle special characters in password', async () => {
      const password = 'P@$$w0rd!#%^&*()';
      const hash = await bcrypt.hash(password, 10);
      const user = { ...mockUser, passwordHash: hash } as User;

      const result = await service.validatePassword(user, password);
      expect(result).toBe(true);
    });
  });
});
