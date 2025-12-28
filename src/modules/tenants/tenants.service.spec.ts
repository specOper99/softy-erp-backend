import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { Tenant } from './entities/tenant.entity';
import { TenantsService } from './tenants.service';

describe('TenantsService', () => {
  let service: TenantsService;
  let repository: Repository<Tenant>;

  const mockTenant: Tenant = {
    id: 'tenant-123',
    name: 'Test Tenant',
    slug: 'test-tenant',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
  } as Tenant;

  const mockRepository = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockResolvedValue(mockTenant),
    find: jest.fn().mockResolvedValue([mockTenant]),
    findOne: jest.fn().mockResolvedValue(mockTenant),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        {
          provide: getRepositoryToken(Tenant),
          useValue: mockRepository,
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
      await expect(service.findOne('invalid')).rejects.toThrow(
        NotFoundException,
      );
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
      await expect(service.findBySlug('invalid-slug')).rejects.toThrow(
        NotFoundException,
      );
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
      await expect(service.update('invalid', {})).rejects.toThrow(
        NotFoundException,
      );
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
      await expect(service.remove('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
