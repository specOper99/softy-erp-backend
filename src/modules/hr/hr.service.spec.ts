import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { EmployeeWallet } from '../finance/entities/employee-wallet.entity';
import { FinanceService } from '../finance/services/finance.service';
import { MailService } from '../mail/mail.service';
import { Profile } from './entities/profile.entity';
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
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: 'user-uuid-123',
      email: 'john@example.com',
      wallet: {
        id: 'wallet-uuid-123',
        userId: 'user-uuid-123',
        pendingBalance: 50.0,
        payableBalance: 150.0,
      },
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
  };

  const mockWalletRepository = {
    findOne: jest.fn().mockResolvedValue(mockWallet),
  };

  const mockFinanceService = {
    getOrCreateWallet: jest.fn().mockResolvedValue(mockWallet),
    getOrCreateWalletWithManager: jest.fn().mockResolvedValue(mockWallet),
    createTransactionWithManager: jest
      .fn()
      .mockResolvedValue({ id: 'txn-uuid-123' }),
    resetPayableBalance: jest
      .fn()
      .mockResolvedValue({ ...mockWallet, payableBalance: 0 }),
  };

  const mockMailService = {
    sendPayrollNotification: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
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
      save: jest
        .fn()
        .mockImplementation((data) =>
          Promise.resolve({ id: 'profile-uuid-123', ...data }),
        ),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
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
        { provide: FinanceService, useValue: mockFinanceService },
        { provide: MailService, useValue: mockMailService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<HrService>(HrService);

    // Mock TenantContextService
    jest
      .spyOn(TenantContextService, 'getTenantId')
      .mockReturnValue('test-tenant-id');

    // Reset mocks
    jest.clearAllMocks();

    // Default behavior
    mockProfileRepository.findOne.mockImplementation(({ where }) => {
      if (where.id === 'profile-uuid-123' || where.userId === 'user-uuid-123') {
        return Promise.resolve({ ...mockProfile });
      }
      return Promise.resolve(null);
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
      expect(
        mockFinanceService.getOrCreateWalletWithManager,
      ).toHaveBeenCalled();
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

    it('should create profile with bank account', async () => {
      const dto = {
        userId: 'user-uuid-123',
        firstName: 'John',
        baseSalary: 2000.0,
        bankAccount: 'IBAN123456789',
      };
      const result = await service.createProfile(dto);
      expect(result).toBeDefined();
    });

    it('should create profile with zero salary', async () => {
      const dto = {
        userId: 'user-uuid-123',
        firstName: 'John',
        baseSalary: 0,
      };
      const result = await service.createProfile(dto);
      expect(result).toBeDefined();
    });

    it('should create profile with high salary', async () => {
      const dto = {
        userId: 'user-uuid-123',
        firstName: 'John',
        baseSalary: 999999.99,
      };
      const result = await service.createProfile(dto);
      expect(result).toBeDefined();
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
    it('should return all profiles with user relations', async () => {
      const result = await service.findAllProfiles();
      expect(result).toEqual([mockProfile]);
      expect(mockProfileRepository.find).toHaveBeenCalledWith({
        where: { tenantId: 'test-tenant-id' },
        relations: ['user'],
      });
    });

    it('should return empty array when no profiles exist', async () => {
      mockProfileRepository.find.mockResolvedValueOnce([]);
      const result = await service.findAllProfiles();
      expect(result).toEqual([]);
    });
  });

  describe('findProfileById', () => {
    it('should return profile by valid id', async () => {
      const result = await service.findProfileById('profile-uuid-123');
      expect(result.firstName).toBe('John');
    });

    it('should throw NotFoundException for invalid id', async () => {
      await expect(service.findProfileById('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findProfileByUserId', () => {
    it('should return profile by user id', async () => {
      const result = await service.findProfileByUserId('user-uuid-123');
      expect(result?.firstName).toBe('John');
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

    it('should update profile salary', async () => {
      await service.updateProfile('profile-uuid-123', {
        baseSalary: 3000,
      });
      expect(mockProfileRepository.save).toHaveBeenCalled();
    });

    it('should update profile job title', async () => {
      await service.updateProfile('profile-uuid-123', {
        jobTitle: 'Senior Photographer',
      });
      expect(mockProfileRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent profile', async () => {
      await expect(
        service.updateProfile('invalid-id', { firstName: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

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

  // ============ PAYROLL RUN TESTS ============
  describe('runPayroll', () => {
    it('should calculate payroll and create transactions', async () => {
      const result = await service.runPayroll();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(
        mockFinanceService.createTransactionWithManager,
      ).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();

      // Total = baseSalary (2000) + payableBalance (150) = 2150
      expect(result.totalPayout).toBe(2150);
      expect(result.totalEmployees).toBe(1);
    });

    it('should catch and log email failures during payroll', async () => {
      mockQueryRunner.manager.find.mockResolvedValue([
        {
          ...mockProfile,
          user: {
            ...mockProfile.user,
            email: 'fail@e.com',
            wallet: { payableBalance: 100 },
          },
        },
      ]);
      mockFinanceService.createTransactionWithManager.mockResolvedValue({
        id: 'tx-1',
      });
      mockMailService.sendPayrollNotification.mockRejectedValue(
        new Error('Email fail'),
      );

      const result = await service.runPayroll();
      expect(result.totalEmployees).toBe(1);
    });

    it('should return transaction IDs', async () => {
      mockQueryRunner.manager.find.mockResolvedValue([mockProfile]);
      mockFinanceService.createTransactionWithManager.mockResolvedValue({
        id: 'txn-uuid-123',
      });
      const result = await service.runPayroll();
      expect(result.transactionIds).toContain('txn-uuid-123');
    });

    it('should reset payable balance after payroll', async () => {
      await service.runPayroll();
      expect(mockFinanceService.resetPayableBalance).toHaveBeenCalled();
    });

    it('should skip employees with zero payout', async () => {
      mockQueryRunner.manager.find.mockResolvedValueOnce([
        {
          ...mockProfile,
          baseSalary: 0,
          user: { wallet: { payableBalance: 0 } },
        },
      ]);

      await service.runPayroll();
      expect(
        mockFinanceService.createTransactionWithManager,
      ).not.toHaveBeenCalled();
    });

    it('should handle employees without wallets', async () => {
      mockQueryRunner.manager.find.mockResolvedValueOnce([
        { ...mockProfile, user: { ...mockProfile.user, wallet: null } },
      ]);
      const result = await service.runPayroll();
      // Should still process with just base salary
      expect(result.totalPayout).toBe(2000);
    });

    it('should process multiple employees', async () => {
      const employee1 = {
        ...mockProfile,
        user: { ...mockProfile.user, wallet: { payableBalance: 150 } },
      };
      const employee2 = {
        ...mockProfile,
        id: 'profile-2',
        userId: 'user-2',
        baseSalary: 3000,
        user: {
          id: 'user-2',
          email: 'u2@e.com',
          wallet: { payableBalance: 100 },
        },
      };
      mockQueryRunner.manager.find.mockResolvedValueOnce([
        employee1,
        employee2,
      ]);

      const result = await service.runPayroll();
      expect(result.totalEmployees).toBe(2);
      // Employee 1: 2000 + 150 = 2150, Employee 2: 3000 + 100 = 3100, Total = 5250
      expect(result.totalPayout).toBe(5250);
    });

    it('should rollback on transaction creation failure', async () => {
      mockFinanceService.createTransactionWithManager.mockRejectedValueOnce(
        new Error('Transaction failed'),
      );
      await expect(service.runPayroll()).rejects.toThrow('Transaction failed');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should rollback on wallet reset failure', async () => {
      mockQueryRunner.manager.find.mockResolvedValueOnce([mockProfile]);
      mockFinanceService.resetPayableBalance.mockRejectedValueOnce(
        new Error('Wallet reset failed'),
      );
      await expect(service.runPayroll()).rejects.toThrow('Wallet reset failed');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should return correct processed timestamp', async () => {
      const result = await service.runPayroll();
      expect(result.processedAt).toBeInstanceOf(Date);
    });

    it('should handle high salary and commission values', async () => {
      mockQueryRunner.manager.find.mockResolvedValueOnce([
        {
          ...mockProfile,
          baseSalary: 999999.99,
          user: { ...mockProfile.user, wallet: { payableBalance: 99999.99 } },
        },
      ]);

      const result = await service.runPayroll();
      expect(result.totalPayout).toBe(1099999.98);
    });
  });

  describe('runScheduledPayroll', () => {
    it('should call runPayroll and log results', async () => {
      const runPayrollSpy = jest
        .spyOn(service, 'runPayroll')
        .mockResolvedValue({
          totalEmployees: 1,
          totalPayout: 100,
          transactionIds: ['tx-1'],
          processedAt: new Date(),
        });
      await service.runScheduledPayroll();
      expect(runPayrollSpy).toHaveBeenCalled();
    });

    it('should handle errors in scheduled payroll', async () => {
      jest.spyOn(service, 'runPayroll').mockRejectedValue(new Error('Failed'));
      await expect(service.runScheduledPayroll()).resolves.not.toThrow();
    });
  });
});
