import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Role } from '../../common/enums';
import { AuditService } from '../audit/audit.service';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService - Comprehensive Tests', () => {
  let service: UsersService;
  let _repository: Repository<User>;

  const mockUser: Partial<User> = {
    id: 'test-uuid-123',
    email: 'test@example.com',
    passwordHash: 'hashedPassword',
    role: Role.FIELD_STAFF,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRepository = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest
      .fn()
      .mockImplementation((user) =>
        Promise.resolve({ id: 'test-uuid-123', ...user }),
      ),
    find: jest.fn().mockResolvedValue([mockUser]),
    findOne: jest.fn(),
    remove: jest.fn().mockResolvedValue(mockUser),
    softRemove: jest.fn().mockResolvedValue(mockUser),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepository },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    _repository = module.get<Repository<User>>(getRepositoryToken(User));

    // Reset mocks
    jest.clearAllMocks();

    // Default findOne behavior - handle BOTH id and email lookups
    mockRepository.findOne.mockImplementation((options: any) => {
      const { where } = options;
      if (where.id === 'test-uuid-123') {
        return Promise.resolve({ ...mockUser });
      }
      if (where.email === 'test@example.com') {
        return Promise.resolve({ ...mockUser });
      }
      return Promise.resolve(null);
    });
  });

  // ============ CREATE USER TESTS ============
  describe('create', () => {
    it('should create user with valid email and password', async () => {
      const dto = { email: 'new@example.com', password: 'password123' };
      const result = await service.create(dto);
      expect(result).toHaveProperty('id');
      expect(mockRepository.create).toHaveBeenCalled();
    });

    it('should hash password before saving', async () => {
      const dto = { email: 'new@example.com', password: 'password123' };
      await service.create(dto);

      const savedUser = mockRepository.create.mock.calls[0][0];
      expect(savedUser.passwordHash).not.toBe('password123');
    });

    it('should use provided role when specified', async () => {
      const dto = {
        email: 'admin@example.com',
        password: 'password123',
        role: Role.ADMIN,
      };
      await service.create(dto);

      const savedUser = mockRepository.create.mock.calls[0][0];
      expect(savedUser.role).toBe(Role.ADMIN);
    });

    it('should allow creating user with OPS_MANAGER role', async () => {
      const dto = {
        email: 'ops@example.com',
        password: 'password123',
        role: Role.OPS_MANAGER,
      };
      await service.create(dto);

      const savedUser = mockRepository.create.mock.calls[0][0];
      expect(savedUser.role).toBe(Role.OPS_MANAGER);
    });

    it('should handle very long passwords', async () => {
      const longPassword = 'a'.repeat(100);
      const dto = { email: 'new@example.com', password: longPassword };
      const result = await service.create(dto);
      expect(result).toHaveProperty('id');
    });
  });

  // ============ FIND OPERATIONS TESTS ============
  describe('findAll', () => {
    it('should return all users', async () => {
      const result = await service.findAll();
      expect(result).toEqual([mockUser]);
    });

    it('should return empty array when no users exist', async () => {
      mockRepository.find.mockResolvedValueOnce([]);
      const result = await service.findAll();
      expect(result).toEqual([]);
    });

    it('should return multiple users', async () => {
      const users = [
        mockUser,
        { ...mockUser, id: 'uuid-2', email: 'user2@example.com' },
      ];
      mockRepository.find.mockResolvedValueOnce(users);
      const result = await service.findAll();
      expect(result.length).toBe(2);
    });
  });

  describe('findOne', () => {
    it('should return user by valid UUID', async () => {
      const result = await service.findOne('test-uuid-123');
      expect(result).toMatchObject({ id: 'test-uuid-123' });
    });

    it('should throw NotFoundException for invalid UUID', async () => {
      await expect(service.findOne('invalid-uuid')).rejects.toThrow(
        NotFoundException,
      );
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
  });

  // ============ UPDATE OPERATIONS TESTS ============
  describe('update', () => {
    it('should update user email', async () => {
      await service.update('test-uuid-123', {
        email: 'updated@example.com',
      });
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should update user role', async () => {
      await service.update('test-uuid-123', {
        role: Role.ADMIN,
      });
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should update user active status', async () => {
      await service.update('test-uuid-123', { isActive: false });
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when updating non-existent user', async () => {
      await expect(
        service.update('invalid-id', { email: 'test@test.com' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============ DELETE OPERATIONS TESTS ============
  describe('remove', () => {
    it('should delete existing user', async () => {
      await service.remove('test-uuid-123');
      expect(mockRepository.softRemove).toHaveBeenCalled();
    });

    it('should throw NotFoundException when deleting non-existent user', async () => {
      await expect(service.remove('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============ PASSWORD VALIDATION TESTS ============
  describe('validatePassword', () => {
    it('should return true for correct password', async () => {
      const password = 'correctPassword';
      const hash = await bcrypt.hash(password, 10);
      const user = { ...mockUser, passwordHash: hash } as User;

      const result = await service.validatePassword(user, password);
      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const hash = await bcrypt.hash('correctPassword', 10);
      const user = { ...mockUser, passwordHash: hash } as User;

      const result = await service.validatePassword(user, 'wrongPassword');
      expect(result).toBe(false);
    });

    it('should return false for empty password', async () => {
      const hash = await bcrypt.hash('correctPassword', 10);
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
