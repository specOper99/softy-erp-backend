import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PlatformTenantService } from '../services/platform-tenant.service';
import { PlatformTenantsController } from './platform-tenants.controller';

describe('PlatformTenantsController', () => {
  let controller: PlatformTenantsController;
  let tenantService: PlatformTenantService;

  const mockRequest = {
    ip: '127.0.0.1',
    user: { userId: 'platform-user-123' },
    validatedReason: 'Customer requested account deletion',
  };

  const mockTenant = {
    id: 'tenant-123',
    name: 'Acme Corporation',
    status: 'ACTIVE',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlatformTenantsController],
      providers: [
        {
          provide: PlatformTenantService,
          useValue: {
            listTenants: jest.fn().mockResolvedValue({
              tenants: [mockTenant],
              total: 1,
            }),
            getTenant: jest.fn().mockResolvedValue(mockTenant),
            suspendTenant: jest.fn().mockResolvedValue(void 0),
            reactivateTenant: jest.fn().mockResolvedValue(void 0),
            deleteTenant: jest.fn().mockResolvedValue({
              ...mockTenant,
              status: 'PENDING_DELETION',
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<PlatformTenantsController>(PlatformTenantsController);
    tenantService = module.get<PlatformTenantService>(PlatformTenantService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Controller', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });
  });

  describe('Tenant Management', () => {
    it('should have listTenants method', () => {
      expect(tenantService.listTenants).toBeDefined();
    });

    it('should have suspendTenant method', () => {
      expect(tenantService.suspendTenant).toBeDefined();
    });

    it('should pass the validated deletion reason to the service', async () => {
      const dto = { scheduleFor: '2026-05-01T00:00:00Z' };

      await controller.deleteTenant('tenant-123', dto, mockRequest);

      expect(tenantService.deleteTenant).toHaveBeenCalledWith(
        'tenant-123',
        dto,
        mockRequest.user.userId,
        mockRequest.ip,
        mockRequest.validatedReason,
      );
    });
  });
});
