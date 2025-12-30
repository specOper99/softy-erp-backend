import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { CreateTenantDto, UpdateTenantDto } from './dto/create-tenant.dto';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

describe('TenantsController', () => {
  let controller: TenantsController;
  let service: TenantsService;

  const mockTenant = {
    id: 'tenant-123',
    name: 'Test Tenant',
    slug: 'test-tenant',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
  };

  const mockService = {
    create: jest.fn().mockResolvedValue(mockTenant),
    findAll: jest.fn().mockResolvedValue([mockTenant]),
    findOne: jest.fn().mockResolvedValue(mockTenant),
    update: jest.fn().mockResolvedValue(mockTenant),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest
      .spyOn(TenantContextService, 'getTenantId')
      .mockReturnValue('tenant-123');

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantsController],
      providers: [
        {
          provide: TenantsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<TenantsController>(TenantsController);
    service = module.get<TenantsService>(TenantsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should reject tenant creation', () => {
      const createDto: CreateTenantDto = {
        name: 'Test Tenant',
        slug: 'test-tenant',
      };

      expect(() => controller.create(createDto)).toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('should return an array of tenants', async () => {
      const result = await controller.findAll();
      expect(service.findOne).toHaveBeenCalledWith('tenant-123');
      expect(result).toEqual([mockTenant]);
    });
  });

  describe('findOne', () => {
    it('should return a tenant', async () => {
      const result = await controller.findOne('tenant-123');
      expect(service.findOne).toHaveBeenCalledWith('tenant-123');
      expect(result).toEqual(mockTenant);
    });

    it('should reject cross-tenant access', () => {
      expect(() => controller.findOne('other-tenant')).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('should update a tenant', async () => {
      const updateDto: UpdateTenantDto = { name: 'Updated Tenant' };
      const result = await controller.update('tenant-123', updateDto);
      expect(service.update).toHaveBeenCalledWith('tenant-123', updateDto);
      expect(result).toEqual(mockTenant);
    });

    it('should reject cross-tenant updates', () => {
      const updateDto: UpdateTenantDto = { name: 'Updated Tenant' };
      expect(() => controller.update('other-tenant', updateDto)).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('remove', () => {
    it('should reject tenant deletion', () => {
      expect(() => controller.remove('tenant-123')).toThrow(ForbiddenException);
    });
  });
});
