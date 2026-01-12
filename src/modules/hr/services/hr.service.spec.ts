import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import { EmployeeWallet } from '../../finance/entities/employee-wallet.entity';
import { WalletService } from '../../finance/services/wallet.service';
import { UsersService } from '../../users/services/users.service';
import { Profile } from '../entities';
import { HrService } from './hr.service';

describe('HrService - Comprehensive Tests', () => {
  let service: HrService;
  const mockProfile = {
    id: 'profile-uuid-123',
    userId: 'user-uuid-123',
    firstName: 'John',
    lastName: 'Doe',
    jobTitle: 'Photographer',
    baseSalary: 2000.0,
    hireDate: new Date('2024-01-01'),
    bankAccount: '1234567890',
    phone: '+1234567890',
    emergencyContactName: 'Jane Doe',
    emergencyContactPhone: '+0987654321',
    address: '123 Main St',
    city: 'Dubai',
    country: 'UAE',
    department: 'Creative',
    team: 'Photography',
    contractType: 'FULL_TIME',
    createdAt: new Date(),
    updatedAt: new Date(),
    // user property is now populated manually
    user: undefined,
  };

  const mockUser = {
    id: 'user-uuid-123',
    email: 'john@example.com',
    tenantId: 'test-tenant-id',
    wallet: {
      id: 'wallet-uuid-123',
      userId: 'user-uuid-123',
      pendingBalance: 50.0,
      payableBalance: 150.0,
    },
  };

  const mockWallet = {
    id: 'wallet-uuid-123',
    userId: 'user-uuid-123',
    pendingBalance: 50.0,
    payableBalance: 150.0,
  };

  const mockProfileRepository = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest
      .fn()
      .mockImplementation((profile) =>
        Promise.resolve({ id: 'profile-uuid-123', ...profile }),
      ),
    find: jest.fn().mockResolvedValue([mockProfile]),
    findOne: jest.fn(),
    remove: jest.fn().mockResolvedValue(mockProfile),
    softRemove: jest.fn().mockResolvedValue(mockProfile),
    count: jest.fn().mockResolvedValue(1),
    createQueryBuilder: jest.fn(),
  };

  const mockWalletRepository = {
    findOne: jest.fn().mockResolvedValue(mockWallet),
  };

  const mockWalletService = {
    getOrCreateWallet: jest.fn().mockResolvedValue(mockWallet),
    getOrCreateWalletWithManager: jest.fn().mockResolvedValue(mockWallet),
    resetPayableBalance: jest
      .fn()
      .mockResolvedValue({ ...mockWallet, payableBalance: 0 }),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockUsersService = {
    findOne: jest.fn().mockResolvedValue(mockUser),
    findMany: jest.fn().mockResolvedValue([mockUser]),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      find: jest.fn().mockResolvedValue([mockProfile]),
      findOne: jest.fn().mockResolvedValue(mockWallet),
      create: jest.fn().mockImplementation((entity, data) => data),
      save: jest.fn().mockImplementation((data) => {
        if (Array.isArray(data)) {
          return Promise.resolve(
            data.map((item, i) => ({ id: `id-${i}`, ...item })),
          );
        }
        return Promise.resolve({ id: 'payout-uuid-123', ...data });
      }),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    getRepository: jest.fn().mockImplementation(() => {
      return {
        create: jest.fn(),
        save: jest.fn(),
        findOne: jest.fn(),
      };
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HrService,
        {
          provide: getRepositoryToken(Profile),
          useValue: mockProfileRepository,
        },
        {
          provide: getRepositoryToken(EmployeeWallet),
          useValue: mockWalletRepository,
        },
        { provide: WalletService, useValue: mockWalletService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<HrService>(HrService);

    // Reset mocks first
    jest.clearAllMocks();

    // Mock TenantContextService AFTER clearAllMocks
    jest
      .spyOn(TenantContextService, 'getTenantId')
      .mockReturnValue('test-tenant-id');
    jest
      .spyOn(TenantContextService, 'getTenantIdOrThrow')
      .mockReturnValue('test-tenant-id');

    // Default behavior
    mockProfileRepository.findOne.mockImplementation(({ where }) => {
      if (where.id === 'profile-uuid-123' || where.userId === 'user-uuid-123') {
        return Promise.resolve({ ...mockProfile });
      }
      return Promise.resolve(null);
    });

    // Mock QueryBuilder
    const qbMock = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockProfile]),
    };
    mockProfileRepository.createQueryBuilder.mockReturnValue(qbMock);

    // Mock queryRunner.manager.findOne for user validation
    mockQueryRunner.manager.findOne.mockImplementation((entity, options) => {
      if (entity === 'User' && options?.where?.id === 'user-uuid-123') {
        return Promise.resolve({
          id: 'user-uuid-123',
          tenantId: 'test-tenant-id',
        });
      }
      return Promise.resolve(mockWallet);
    });
  });

  // ============ PROFILE CRUD TESTS ============
  describe('createProfile', () => {
    it('should create profile and wallet for user', async () => {
      const dto = {
        userId: 'user-uuid-123',
        firstName: 'John',
        lastName: 'Doe',
        baseSalary: 2000.0,
      };

      const result = await service.createProfile(dto);
      expect(mockWalletService.getOrCreateWalletWithManager).toHaveBeenCalled();
      expect(mockUsersService.findOne).toHaveBeenCalledWith('user-uuid-123');
      expect(result).toHaveProperty('id');
    });

    it('should create profile with hire date', async () => {
      const dto = {
        userId: 'user-uuid-123',
        firstName: 'John',
        baseSalary: 2000.0,
        hireDate: '2024-01-01T00:00:00Z',
      };
      const result = await service.createProfile(dto);
      expect(result).toBeDefined();
    });

    // ... (keep usage of other tests, assuming existing structure remains valid for logic)

    it('should create profile with all fields', async () => {
      const dto = {
        userId: 'user-uuid-123',
        firstName: 'John',
        lastName: 'Doe',
        baseSalary: 2000.0,
        emergencyContactName: 'Jane Doe',
        emergencyContactPhone: '+0987654321',
        address: '123 Main St',
        city: 'Dubai',
        country: 'UAE',
        department: 'Creative',
        team: 'Photography',
        contractType: 'FULL_TIME',
      };

      const result = await service.createProfile(dto as any);
      expect(result).toMatchObject(dto);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityName: 'Profile',
        }),
        expect.any(Object),
      );
    });
  });

  it('should throw ConflictException if profile already exists', async () => {
    const dto = {
      userId: 'user-uuid-123',
      firstName: 'John',
      baseSalary: 2000.0,
    };
    mockQueryRunner.manager.save.mockRejectedValueOnce({ code: '23505' });
    await expect(service.createProfile(dto)).rejects.toThrow(
      'Profile already exists',
    );
  });

  it('should throw generic error on failure', async () => {
    const dto = {
      userId: 'user-uuid-123',
      firstName: 'John',
      baseSalary: 2000.0,
    };
    mockQueryRunner.manager.save.mockRejectedValueOnce(
      new Error('Database error'),
    );
    await expect(service.createProfile(dto)).rejects.toThrow('Database error');
  });

  describe('findAllProfiles', () => {
    it('should return all profiles with user relations populated manually', async () => {
      const result = await service.findAllProfiles();
      expect(result[0].user).toEqual(mockUser);
      expect(mockProfileRepository.find).toHaveBeenCalledWith({
        where: { tenantId: 'test-tenant-id' },
        skip: 0,
        take: 20,
      });
      expect(mockUsersService.findMany).toHaveBeenCalledWith(['user-uuid-123']);
    });

    it('should return empty array when no profiles exist', async () => {
      mockProfileRepository.find.mockResolvedValueOnce([]);
      const result = await service.findAllProfiles();
      expect(result).toEqual([]);
    });
  });

  describe('findProfileById', () => {
    it('should return profile by valid id with user', async () => {
      const result = await service.findProfileById('profile-uuid-123');
      expect(result.firstName).toBe('John');
      expect(result.user).toEqual(mockUser);
      expect(mockUsersService.findOne).toHaveBeenCalledWith('user-uuid-123');
    });

    it('should throw NotFoundException for invalid id', async () => {
      await expect(service.findProfileById('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findProfileByUserId', () => {
    it('should return profile by user id with user', async () => {
      const result = await service.findProfileByUserId('user-uuid-123');
      expect(result?.firstName).toBe('John');
      expect(result?.user).toEqual(mockUser);
    });

    it('should return null for non-existent user', async () => {
      mockProfileRepository.findOne.mockResolvedValueOnce(null);
      const result = await service.findProfileByUserId('invalid-user');
      expect(result).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('should update profile first name', async () => {
      await service.updateProfile('profile-uuid-123', {
        firstName: 'Jane',
      });
      expect(mockProfileRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent profile', async () => {
      await expect(
        service.updateProfile('invalid-id', { firstName: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============ DELETE PROFILE TESTS ============
  describe('deleteProfile', () => {
    it('should delete existing profile', async () => {
      await service.deleteProfile('profile-uuid-123');
      expect(mockProfileRepository.remove).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent profile', async () => {
      await expect(service.deleteProfile('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('softDeleteProfileByUserId', () => {
    it('should soft remove profile if it exists', async () => {
      await service.softDeleteProfileByUserId('user-uuid-123');
      expect(mockProfileRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-uuid-123' }),
        }),
      );
      expect(mockProfileRepository.softRemove).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'profile-uuid-123' }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELETE',
          entityName: 'Profile',
        }),
      );
    });

    it('should do nothing if profile does not exist', async () => {
      mockProfileRepository.findOne.mockReturnValueOnce(null);
      await service.softDeleteProfileByUserId('non-existent-user');
      expect(mockProfileRepository.softRemove).not.toHaveBeenCalled();
    });
  });
});
