import { Test, TestingModule } from '@nestjs/testing';
import { PlatformTenantService } from '../services/platform-tenant.service';
import { PlatformTenantsController } from './platform-tenants.controller';

describe('PlatformTenantsController', () => {
  let controller: PlatformTenantsController;
  let tenantService: PlatformTenantService;

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
            findAll: jest.fn().mockResolvedValue({
              tenants: [mockTenant],
              total: 1,
            }),
            findOne: jest.fn().mockResolvedValue(mockTenant),
            suspend: jest.fn().mockResolvedValue(void 0),
            reactivate: jest.fn().mockResolvedValue(void 0),
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
    it('should have findAll method', () => {
      expect(tenantService.findAll).toBeDefined();
    });

    it('should have suspend method', () => {
      expect(tenantService.suspend).toBeDefined();
    });
  });
});
