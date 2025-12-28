import { Test, TestingModule } from '@nestjs/testing';
import { FinanceService } from '../services/finance.service';
import { WalletsController } from './wallets.controller';

describe('WalletsController', () => {
  let controller: WalletsController;
  let service: FinanceService;

  const mockWallet = { id: 'uuid', balance: 500 };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletsController],
      providers: [
        {
          provide: FinanceService,
          useValue: {
            getAllWallets: jest.fn().mockResolvedValue([mockWallet]),
            getWalletByUserId: jest.fn().mockResolvedValue(mockWallet),
          },
        },
      ],
    }).compile();

    controller = module.get<WalletsController>(WalletsController);
    service = module.get<FinanceService>(FinanceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call service.getAllWallets', async () => {
      await controller.findAll();
      expect(service.getAllWallets).toHaveBeenCalled();
    });
  });

  describe('findByUserId', () => {
    it('should call service.getWalletByUserId', async () => {
      await controller.findByUserId('u-uuid');
      expect(service.getWalletByUserId).toHaveBeenCalledWith('u-uuid');
    });
  });
});
