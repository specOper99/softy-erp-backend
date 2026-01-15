import { Test, TestingModule } from '@nestjs/testing';
import {
  createMockEmployeeWallet,
  createMockTenantAwareRepository,
  MockRepository,
  mockTenantContext,
} from '../../../../test/helpers/mock-factories';
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
});
