import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import {
  createMockEmployeeWallet,
  createMockTenantAwareRepository,
  MockRepository,
  mockTenantContext,
} from '../../../../test/helpers/mock-factories';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { EntityManager } from 'typeorm';
import { EmployeeWallet } from '../entities/employee-wallet.entity';
import { WalletRepository } from '../repositories/wallet.repository';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  let service: WalletService;
  let mockWalletRepository: MockRepository<EmployeeWallet>;

  const mockTenantId = 'tenant-1';
  const mockUserId = 'user-1';
  const mockWallet = createMockEmployeeWallet({
    id: 'wallet-1',
    userId: mockUserId,
    tenantId: mockTenantId,
  }) as unknown as EmployeeWallet;

  beforeEach(async () => {
    mockTenantContext(mockTenantId);
    mockWalletRepository = createMockTenantAwareRepository<EmployeeWallet>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: WalletRepository,
          useValue: mockWalletRepository,
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrCreateWallet', () => {
    it('should return existing wallet if found', async () => {
      mockWalletRepository.findOne.mockResolvedValue(mockWallet);

      const result = await service.getOrCreateWallet(mockUserId);

      expect(result).toEqual(mockWallet);
      expect(mockWalletRepository.findOne).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
    });

    it('should create new wallet if not found', async () => {
      mockWalletRepository.findOne.mockResolvedValueOnce(null);
      mockWalletRepository.create.mockReturnValue(mockWallet);
      mockWalletRepository.save.mockResolvedValue(mockWallet);

      const result = await service.getOrCreateWallet(mockUserId);

      expect(result).toEqual(mockWallet);
      expect(mockWalletRepository.create).toHaveBeenCalledWith({
        userId: mockUserId,
        pendingBalance: 0,
        payableBalance: 0,
      });
      expect(mockWalletRepository.save).toHaveBeenCalledWith(mockWallet);
    });
  });

  describe('getWalletByUserId', () => {
    it('should return wallet by user id', async () => {
      mockWalletRepository.findOne.mockResolvedValue(mockWallet);

      const result = await service.getWalletByUserId(mockUserId);

      expect(result).toEqual(mockWallet);
      expect(mockWalletRepository.findOne).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        relations: ['user'],
      });
    });

    it('should return null if not found', async () => {
      mockWalletRepository.findOne.mockResolvedValue(null);

      const result = await service.getWalletByUserId(mockUserId);

      expect(result).toBeNull();
    });
  });

  describe('getAllWallets', () => {
    it('should return all wallets', async () => {
      mockWalletRepository.find.mockResolvedValue([mockWallet]);

      const result = await service.getAllWallets();

      expect(result).toEqual([mockWallet]);
      expect(mockWalletRepository.find).toHaveBeenCalledWith({
        relations: ['user'],
        skip: 0,
        take: 20,
      });
    });
  });

  describe('getOrCreateWalletWithManager', () => {
    it('should return existing wallet if found (locked)', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockWallet),
        create: jest.fn(),
        save: jest.fn(),
      } as unknown as EntityManager;

      const result = await service.getOrCreateWalletWithManager(manager, mockUserId);

      expect(result).toEqual(mockWallet);
      expect(manager.findOne).toHaveBeenCalledWith(EmployeeWallet, {
        where: { userId: mockUserId, tenantId: mockTenantId },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.create).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('should create wallet when missing (manager)', async () => {
      const createdWallet = createMockEmployeeWallet({
        userId: mockUserId,
        tenantId: mockTenantId,
        pendingBalance: 0,
        payableBalance: 0,
      }) as unknown as EmployeeWallet;

      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(createdWallet),
        save: jest.fn().mockResolvedValue(createdWallet),
      } as unknown as EntityManager;

      const result = await service.getOrCreateWalletWithManager(manager, mockUserId);

      expect(result).toEqual(createdWallet);
      expect(manager.create).toHaveBeenCalledWith(EmployeeWallet, {
        userId: mockUserId,
        pendingBalance: 0,
        payableBalance: 0,
        tenantId: mockTenantId,
      });
      expect(manager.save).toHaveBeenCalledWith(createdWallet);
    });

    it('should handle concurrent wallet creation (unique_violation) by reloading wallet', async () => {
      const existingWallet = createMockEmployeeWallet({
        userId: mockUserId,
        tenantId: mockTenantId,
        pendingBalance: 0,
        payableBalance: 0,
      }) as unknown as EmployeeWallet;

      const manager = {
        findOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(existingWallet),
        create: jest.fn().mockReturnValue(existingWallet),
        save: jest.fn().mockRejectedValue({ code: '23505' }),
      } as unknown as EntityManager;

      const result = await service.getOrCreateWalletWithManager(manager, mockUserId);

      expect(result).toEqual(existingWallet);
      expect(manager.save).toHaveBeenCalled();
      expect(manager.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAllWalletsCursor', () => {
    it('should delegate to CursorPaginationHelper.paginate', async () => {
      const query = new CursorPaginationDto();
      query.cursor = 'cursor-123';
      query.limit = 10;

      const paginateSpy = jest
        .spyOn(CursorPaginationHelper, 'paginate')
        .mockResolvedValue({ data: [mockWallet], nextCursor: 'next-cursor' });

      const result = await service.getAllWalletsCursor(query);

      expect(result).toEqual({ data: [mockWallet], nextCursor: 'next-cursor' });
      expect(mockWalletRepository.createQueryBuilder).toHaveBeenCalledWith('wallet');
      expect(paginateSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          cursor: 'cursor-123',
          limit: 10,
          alias: 'wallet',
        }),
      );
    });
  });

  describe('addPendingCommission', () => {
    it('should reject non-positive amounts', async () => {
      const manager = {
        queryRunner: { isTransactionActive: true },
      } as unknown as EntityManager;

      await expect(service.addPendingCommission(manager, mockUserId, 0)).rejects.toThrow(BadRequestException);
    });

    it('should create wallet if missing and add pending balance', async () => {
      const manager = {
        queryRunner: { isTransactionActive: true },
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((_entity, data) => data),
        save: jest.fn().mockImplementation((wallet) => Promise.resolve(wallet)),
      } as unknown as EntityManager;

      const result = await service.addPendingCommission(manager, mockUserId, 25);

      expect(result.pendingBalance).toBe(25);
      expect(result.payableBalance).toBe(0);
      expect(result.tenantId).toBe(mockTenantId);
      expect(manager.save).toHaveBeenCalled();
    });

    it('should add to pending balance when wallet exists', async () => {
      const existing = createMockEmployeeWallet({
        userId: mockUserId,
        tenantId: mockTenantId,
        pendingBalance: 10,
        payableBalance: 0,
      }) as unknown as EmployeeWallet;

      const manager = {
        queryRunner: { isTransactionActive: true },
        findOne: jest.fn().mockResolvedValue(existing),
        save: jest.fn().mockImplementation((wallet) => Promise.resolve(wallet)),
      } as unknown as EntityManager;

      const result = await service.addPendingCommission(manager, mockUserId, 5);

      expect(result.pendingBalance).toBe(15);
      expect(manager.save).toHaveBeenCalledWith(existing);
    });
  });

  describe('subtractPendingCommission', () => {
    it('should reject non-positive amounts', async () => {
      const manager = {
        queryRunner: { isTransactionActive: true },
      } as unknown as EntityManager;

      await expect(service.subtractPendingCommission(manager, mockUserId, 0)).rejects.toThrow(BadRequestException);
    });

    it('should subtract from pending balance', async () => {
      const existing = createMockEmployeeWallet({
        userId: mockUserId,
        tenantId: mockTenantId,
        pendingBalance: 10,
        payableBalance: 0,
      }) as unknown as EmployeeWallet;

      const manager = {
        queryRunner: { isTransactionActive: true },
        findOne: jest.fn().mockResolvedValue(existing),
        save: jest.fn().mockImplementation((wallet) => Promise.resolve(wallet)),
      } as unknown as EntityManager;

      const result = await service.subtractPendingCommission(manager, mockUserId, 4);
      expect(result.pendingBalance).toBe(6);
    });

    it('should clamp pending balance to 0 and warn when subtraction goes negative', async () => {
      const existing = createMockEmployeeWallet({
        userId: mockUserId,
        tenantId: mockTenantId,
        pendingBalance: 3,
        payableBalance: 0,
      }) as unknown as EmployeeWallet;

      const manager = {
        queryRunner: { isTransactionActive: true },
        findOne: jest.fn().mockResolvedValue(existing),
        save: jest.fn().mockImplementation((wallet) => Promise.resolve(wallet)),
      } as unknown as EntityManager;

      const loggerSpy = jest.spyOn((service as unknown as { logger: Logger }).logger, 'warn');

      const result = await service.subtractPendingCommission(manager, mockUserId, 10);

      expect(result.pendingBalance).toBe(0);
      expect(loggerSpy).toHaveBeenCalled();
    });

    it('should throw NotFoundException when wallet missing', async () => {
      const manager = {
        queryRunner: { isTransactionActive: true },
        findOne: jest.fn().mockResolvedValue(null),
      } as unknown as EntityManager;

      await expect(service.subtractPendingCommission(manager, mockUserId, 5)).rejects.toThrow(NotFoundException);
    });
  });

  describe('moveToPayable', () => {
    it('should reject non-positive amounts', async () => {
      const manager = {
        queryRunner: { isTransactionActive: true },
      } as unknown as EntityManager;

      await expect(service.moveToPayable(manager, mockUserId, 0)).rejects.toThrow(BadRequestException);
    });

    it('should reject if transfer exceeds pending balance', async () => {
      const existing = createMockEmployeeWallet({
        userId: mockUserId,
        tenantId: mockTenantId,
        pendingBalance: 5,
        payableBalance: 0,
      }) as unknown as EmployeeWallet;

      const manager = {
        queryRunner: { isTransactionActive: true },
        findOne: jest.fn().mockResolvedValue(existing),
        save: jest.fn().mockImplementation((wallet) => Promise.resolve(wallet)),
      } as unknown as EntityManager;

      await expect(service.moveToPayable(manager, mockUserId, 10)).rejects.toThrow(BadRequestException);
    });

    it('should move pending balance to payable', async () => {
      const existing = createMockEmployeeWallet({
        userId: mockUserId,
        tenantId: mockTenantId,
        pendingBalance: 10,
        payableBalance: 2,
      }) as unknown as EmployeeWallet;

      const manager = {
        queryRunner: { isTransactionActive: true },
        findOne: jest.fn().mockResolvedValue(existing),
        save: jest.fn().mockImplementation((wallet) => Promise.resolve(wallet)),
      } as unknown as EntityManager;

      const result = await service.moveToPayable(manager, mockUserId, 4);
      expect(result.pendingBalance).toBe(6);
      expect(result.payableBalance).toBe(6);
    });
  });

  describe('resetPayableBalance', () => {
    it('should set payable balance to 0', async () => {
      const existing = createMockEmployeeWallet({
        userId: mockUserId,
        tenantId: mockTenantId,
        pendingBalance: 0,
        payableBalance: 123,
      }) as unknown as EmployeeWallet;

      const manager = {
        queryRunner: { isTransactionActive: true },
        findOne: jest.fn().mockResolvedValue(existing),
        save: jest.fn().mockImplementation((wallet) => Promise.resolve(wallet)),
      } as unknown as EntityManager;

      const result = await service.resetPayableBalance(manager, mockUserId);
      expect(result.payableBalance).toBe(0);
    });
  });

  describe('refundPayableBalance', () => {
    it('should return wallet without changes when refund amount is 0', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockWallet),
        create: jest.fn(),
        save: jest.fn(),
      } as unknown as EntityManager;

      const spy = jest.spyOn(service, 'getOrCreateWalletWithManager');

      const result = await service.refundPayableBalance(manager, mockUserId, 0);

      expect(result).toEqual(mockWallet);
      expect(spy).toHaveBeenCalledWith(manager, mockUserId);
    });

    it('should add to payable balance and log', async () => {
      const existing = createMockEmployeeWallet({
        userId: mockUserId,
        tenantId: mockTenantId,
        payableBalance: 5,
      }) as unknown as EmployeeWallet;

      const manager = {
        queryRunner: { isTransactionActive: true },
        findOne: jest.fn().mockResolvedValue(existing),
        save: jest.fn().mockImplementation((wallet) => Promise.resolve(wallet)),
      } as unknown as EntityManager;

      const loggerSpy = jest.spyOn((service as unknown as { logger: Logger }).logger, 'log');

      const result = await service.refundPayableBalance(manager, mockUserId, 2);

      expect(result.payableBalance).toBe(7);
      expect(loggerSpy).toHaveBeenCalled();
    });
  });
});
