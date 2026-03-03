import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FlagsService } from '../../common/flags/flags.service';
import { MetricsFactory } from '../../common/services/metrics.factory';
import { EntityManager, Repository } from 'typeorm';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { Tenant } from './entities/tenant.entity';
import { TenantStatus } from './enums/tenant-status.enum';
import { TenantsService } from './tenants.service';

describe('TenantsService', () => {
  let service: TenantsService;
  let repository: Repository<Tenant>;
  let flagsService: { isEnabled: jest.Mock };

  const mockTenant: Tenant = {
    id: 'tenant-123',
    name: 'Test Tenant',
    slug: 'test-tenant',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    subscriptionPlan: 'FREE',
    status: 'ACTIVE',
  } as unknown as Tenant;

  const mockRepository = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockResolvedValue(mockTenant),
    find: jest.fn().mockResolvedValue([mockTenant]),
    findOne: jest.fn().mockResolvedValue(mockTenant),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    flagsService = {
      isEnabled: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        {
          provide: getRepositoryToken(Tenant),
          useValue: mockRepository,
        },
        {
          provide: FlagsService,
          useValue: flagsService,
        },
        {
          provide: MetricsFactory,
          useValue: {
            getOrCreateCounter: jest.fn().mockReturnValue({ inc: jest.fn() }),
          },
        },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
    repository = module.get<Repository<Tenant>>(getRepositoryToken(Tenant));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create and save a tenant', async () => {
      const createDto: CreateTenantDto = {
        name: 'Test Tenant',
        slug: 'test-tenant',
      };
      const result = await service.create(createDto);
      expect(repository.create).toHaveBeenCalledWith(createDto);
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual(mockTenant);
    });
  });

  describe('createWithManager', () => {
    it('should create and save using manager', async () => {
      const managerMock = {
        create: jest.fn().mockReturnValue(mockTenant),
        save: jest.fn().mockResolvedValue(mockTenant),
      } as unknown as EntityManager;
      const dto = { name: 'T', slug: 't' };
      const result = await service.createWithManager(managerMock, dto);
      expect(managerMock.create).toHaveBeenCalledWith(Tenant, dto);
      expect(managerMock.save).toHaveBeenCalledWith(mockTenant);
      expect(result).toEqual(mockTenant);
    });
  });

  describe('findAll', () => {
    it('should return an array of tenants', async () => {
      const result = await service.findAll();
      expect(repository.find).toHaveBeenCalled();
      expect(result).toEqual([mockTenant]);
    });
  });

  describe('findOne', () => {
    it('should return a tenant if found', async () => {
      const result = await service.findOne('tenant-123');
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
      });
      expect(result).toEqual(mockTenant);
    });

    it('should throw NotFoundException if not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);
      await expect(service.findOne('invalid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findBySlug', () => {
    it('should return a tenant if found by slug', async () => {
      const result = await service.findBySlug('test-tenant');
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { slug: 'test-tenant' },
      });
      expect(result).toEqual(mockTenant);
    });

    it('should throw NotFoundException if not found by slug', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);
      await expect(service.findBySlug('invalid-slug')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update and return the tenant', async () => {
      const updateDto = { name: 'Updated Name' };
      const result = await service.update('tenant-123', updateDto);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
      });
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual(mockTenant);
    });

    it('should throw NotFoundException if tenant to update not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);
      await expect(service.update('invalid', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove the tenant', async () => {
      await service.remove('tenant-123');
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
      });
      expect(repository.remove).toHaveBeenCalledWith(mockTenant);
    });

    it('should throw NotFoundException if tenant to remove not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);
      await expect(service.remove('invalid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('ensurePortalTenantAccessible', () => {
    it('throws for suspended tenant when strict flag enabled', () => {
      flagsService.isEnabled.mockReturnValue(true);
      const suspendedTenant = { ...mockTenant, status: TenantStatus.SUSPENDED } as Tenant;

      expect(() => service.ensurePortalTenantAccessible(suspendedTenant)).toThrow('client-portal.tenant_blocked');
    });

    it('allows suspended tenant when strict flag disabled', () => {
      flagsService.isEnabled.mockReturnValue(false);
      const suspendedTenant = { ...mockTenant, status: TenantStatus.SUSPENDED } as Tenant;

      expect(() => service.ensurePortalTenantAccessible(suspendedTenant)).not.toThrow();
    });
  });
});
