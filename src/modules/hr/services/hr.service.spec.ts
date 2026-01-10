import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import { EmployeeWallet } from '../../finance/entities/employee-wallet.entity';
import { Payout } from '../../finance/entities/payout.entity';
import { FinanceService } from '../../finance/services/finance.service';
import { WalletService } from '../../finance/services/wallet.service';
import { MailService } from '../../mail/mail.service';
import { TenantsService } from '../../tenants/tenants.service';
import { PayrollRun, Profile } from '../entities';
import { HrService } from './hr.service';
import { MockPaymentGatewayService } from './payment-gateway.service';

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
    count: jest.fn().mockResolvedValue(1),
  };

  const mockWalletRepository = {
    findOne: jest.fn().mockResolvedValue(mockWallet),
  };

  const mockFinanceService = {
    createTransactionWithManager: jest
      .fn()
      .mockResolvedValue({ id: 'txn-uuid-123' }),
  };

  const mockWalletService = {
    getOrCreateWallet: jest.fn().mockResolvedValue(mockWallet),
    getOrCreateWalletWithManager: jest.fn().mockResolvedValue(mockWallet),
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

  const mockPayoutRepository = {
    create: jest
      .fn()
      .mockImplementation((data) => ({ id: 'payout-uuid-123', ...data })),
    save: jest
      .fn()
      .mockImplementation((data) =>
        Promise.resolve({ id: 'payout-uuid-123', ...data }),
      ),
    findOne: jest.fn().mockResolvedValue(null), // Default: no pending payout
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    query: jest.fn().mockResolvedValue([{ locked: true }]), // Mock advisory lock success
    getRepository: jest.fn().mockImplementation((entity) => {
      if (entity === Payout) {
        return mockPayoutRepository;
      }
      return {
        create: jest.fn(),
        save: jest.fn(),
        findOne: jest.fn(),
      };
    }),
  };

  const mockTenantsService = {
    findAll: jest
      .fn()
      .mockResolvedValue([{ id: 'test-tenant-id', slug: 'test-tenant' }]),
  };

  const mockPayrollRunRepository = {
    create: jest
      .fn()
      .mockImplementation((data) => ({ id: 'run-uuid-123', ...data })),
    save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
    find: jest.fn().mockResolvedValue([]),
  };

  const mockPaymentGatewayService = {
    triggerPayout: jest
      .fn()
      .mockResolvedValue({ success: true, transactionReference: 'REF-123' }),
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
          provide: getRepositoryToken(PayrollRun),
          useValue: mockPayrollRunRepository,
        },
        {
          provide: getRepositoryToken(EmployeeWallet),
          useValue: mockWalletRepository,
        },
        { provide: FinanceService, useValue: mockFinanceService },
        { provide: WalletService, useValue: mockWalletService },
        { provide: MailService, useValue: mockMailService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: TenantsService, useValue: mockTenantsService },
        {
          provide: MockPaymentGatewayService,
          useValue: mockPaymentGatewayService,
        },
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

      // Mock user validation
      mockQueryRunner.manager.findOne.mockImplementation((entity, _options) => {
        if (entity === 'User') {
          return Promise.resolve({
            id: 'user-uuid-123',
            tenantId: 'test-tenant-id',
          });
        }
        return Promise.resolve(mockWallet);
      });

      const result = await service.createProfile(dto);
      expect(mockWalletService.getOrCreateWalletWithManager).toHaveBeenCalled();
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

      // Mock user validation for this specific test
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        id: 'user-uuid-123',
        tenantId: 'test-tenant-id',
      });

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
    it('should return all profiles with user relations', async () => {
      const result = await service.findAllProfiles();
      expect(result).toEqual([mockProfile]);
      expect(mockProfileRepository.find).toHaveBeenCalledWith({
        where: { tenantId: 'test-tenant-id' },
        relations: ['user'],
        skip: 0,
        take: 20,
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

    it('should update profile with new fields', async () => {
      await service.updateProfile('profile-uuid-123', {
        department: 'Tech',
        contractType: 'CONTRACTOR' as any,
      });
      expect(mockProfileRepository.save).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          entityName: 'Profile',
          newValues: expect.objectContaining({
            department: 'Tech',
            contractType: 'CONTRACTOR',
          }),
        }),
      );
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
      ).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          type: 'PAYROLL',
          payoutId: 'payout-uuid-123',
        }),
      );
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
      expect(mockWalletService.resetPayableBalance).toHaveBeenCalled();
    });

    it('should skip employees with zero payout', async () => {
      mockProfileRepository.find.mockResolvedValueOnce([
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
      mockProfileRepository.find.mockResolvedValueOnce([
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
      mockProfileRepository.find.mockResolvedValueOnce([employee1, employee2]);
      mockProfileRepository.count.mockResolvedValueOnce(2);

      const result = await service.runPayroll();
      expect(result.totalEmployees).toBe(2);
      // Employee 1: 2000 + 150 = 2150, Employee 2: 3000 + 100 = 3100, Total = 5250
      expect(result.totalPayout).toBe(5250);
    });

    it('should rollback on transaction creation failure and continue', async () => {
      mockFinanceService.createTransactionWithManager.mockRejectedValueOnce(
        new Error('Transaction failed'),
      );
      // With batch processing, errors are caught per batch and payroll continues
      const result = await service.runPayroll();
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      // The batch failed so no employees processed in that batch
      expect(result.totalEmployees).toBe(0);
    });

    it('should rollback on wallet reset failure and continue', async () => {
      mockQueryRunner.manager.find.mockResolvedValueOnce([mockProfile]);
      mockWalletService.resetPayableBalance.mockRejectedValueOnce(
        new Error('Wallet reset failed'),
      );
      // With batch processing, errors are caught per batch and payroll continues
      const result = await service.runPayroll();
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(result.totalEmployees).toBe(0);
    });

    it('should return correct processed timestamp', async () => {
      const result = await service.runPayroll();
      expect(result.processedAt).toBeInstanceOf(Date);
    });

    it('should handle high salary and commission values', async () => {
      mockProfileRepository.find.mockResolvedValueOnce([
        {
          ...mockProfile,
          baseSalary: 999999.99,
          user: { ...mockProfile.user, wallet: { payableBalance: 99999.99 } },
        },
      ]);

      const result = await service.runPayroll();
      expect(result.totalPayout).toBe(1099999.98);
      expect(mockPayrollRunRepository.save).toHaveBeenCalled();
    });

    it('should save PayrollRun record on completion', async () => {
      await service.runPayroll();
      expect(mockPayrollRunRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'COMPLETED',
          totalEmployees: 1,
        }),
      );
      expect(mockPayrollRunRepository.save).toHaveBeenCalled();
    });
  });

  describe('getPayrollHistory', () => {
    it('should return payroll run history', async () => {
      const mockRuns = [{ id: 'run-1', totalPayout: 1000 }];
      mockPayrollRunRepository.find.mockResolvedValueOnce(mockRuns);
      const result = await service.getPayrollHistory();
      expect(result).toEqual(mockRuns);
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
      // Mock TenantContextService.run to execute the callback
      jest
        .spyOn(TenantContextService, 'run')
        .mockImplementation((_tenantId, callback) => {
          callback();
        });
      mockTenantsService.findAll.mockResolvedValue([
        { id: 'tenant-1', slug: 'test' },
      ]);
      jest.spyOn(service, 'runPayroll').mockRejectedValue(new Error('Failed'));

      // Should not throw - errors are caught and logged
      await expect(service.runScheduledPayroll()).resolves.not.toThrow();
    });
  });
});
