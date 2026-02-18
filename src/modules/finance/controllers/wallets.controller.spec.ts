import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { MFA_REQUIRED_KEY } from '../../auth/guards/mfa-required.guard';
import { Role } from '../../users/enums/role.enum';
import { createMockEmployeeWallet } from '../../../../test/helpers/mock-factories';
import { WalletService } from '../services/wallet.service';
import { WalletsController } from './wallets.controller';

describe('WalletsController', () => {
  let controller: WalletsController;
  let service: WalletService;

  const mockWallet = createMockEmployeeWallet({ id: 'uuid', userId: 'field-staff-uuid', payableBalance: 500 });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletsController],
      providers: [
        {
          provide: WalletService,
          useValue: {
            getAllWallets: jest.fn().mockResolvedValue([mockWallet]),
            getWalletByUserId: jest.fn().mockResolvedValue(mockWallet),
          },
        },
      ],
    }).compile();

    controller = module.get<WalletsController>(WalletsController);
    service = module.get<WalletService>(WalletService);
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

  describe('findMyWallet', () => {
    it('should call service.getWalletByUserId with current user id', async () => {
      const currentUserId = 'field-staff-uuid';

      const result = await controller.findMyWallet(currentUserId);

      expect(service.getWalletByUserId).toHaveBeenCalledWith(currentUserId);
      expect(result?.userId).toBe(currentUserId);
    });

    it('should allow FIELD_STAFF, ADMIN, and OPS_MANAGER via roles metadata', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, WalletsController.prototype.findMyWallet);

      expect(roles).toEqual(expect.arrayContaining([Role.FIELD_STAFF, Role.ADMIN, Role.OPS_MANAGER]));
    });

    it('should exempt findMyWallet from MFA requirement', () => {
      const isMfaRequired = Reflect.getMetadata(MFA_REQUIRED_KEY, WalletsController.prototype.findMyWallet);

      expect(isMfaRequired).toBe(false);
    });
  });

  describe('RBAC Regression Tests', () => {
    let reflector: Reflector;
    let guard: RolesGuard;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        controllers: [WalletsController],
        providers: [
          {
            provide: WalletService,
            useValue: {
              getAllWallets: jest.fn().mockResolvedValue([mockWallet]),
              getWalletByUserId: jest.fn().mockResolvedValue(mockWallet),
            },
          },
          {
            provide: Reflector,
            useValue: {
              getAllAndOverride: jest.fn(),
            },
          },
        ],
      }).compile();
      reflector = module.get<Reflector>(Reflector);
      guard = new RolesGuard(reflector);
    });

    it('should block FIELD_STAFF from accessing other users wallets (findByUserId)', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: Role.FIELD_STAFF } }),
        }),
        getHandler: () => controller.findByUserId,
        getClass: () => WalletsController,
      } as unknown as Parameters<typeof guard.canActivate>[0];

      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === ROLES_KEY) {
          return [Role.ADMIN, Role.OPS_MANAGER];
        }
        return undefined;
      });

      const result = guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should allow OPS_MANAGER to access other users wallets (findByUserId)', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: Role.OPS_MANAGER } }),
        }),
        getHandler: () => controller.findByUserId,
        getClass: () => WalletsController,
      } as unknown as Parameters<typeof guard.canActivate>[0];

      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === ROLES_KEY) {
          return [Role.ADMIN, Role.OPS_MANAGER];
        }
        return undefined;
      });

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should allow ADMIN to access other users wallets (findByUserId)', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: Role.ADMIN } }),
        }),
        getHandler: () => controller.findByUserId,
        getClass: () => WalletsController,
      } as unknown as Parameters<typeof guard.canActivate>[0];

      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === ROLES_KEY) {
          return [Role.ADMIN, Role.OPS_MANAGER];
        }
        return undefined;
      });

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should allow FIELD_STAFF to access their own wallet (findMyWallet)', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: Role.FIELD_STAFF } }),
        }),
        getHandler: () => controller.findMyWallet,
        getClass: () => WalletsController,
      } as unknown as Parameters<typeof guard.canActivate>[0];

      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === ROLES_KEY) {
          return [Role.FIELD_STAFF, Role.ADMIN, Role.OPS_MANAGER];
        }
        return undefined;
      });

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });
  });
});
