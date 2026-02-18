import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createMockRepository, MockRepository, mockTenantContext } from '../../../../test/helpers/mock-factories';
import { Vendor } from '../entities';
import { VendorsService } from './vendors.service';

describe('VendorsService', () => {
  let service: VendorsService;
  let repository: MockRepository<Vendor>;

  const mockVendor: Vendor = {
    id: 'vendor-1',
    tenantId: 'tenant-123',
    name: 'Acme Supplies',
    email: 'acme@test.com',
    phone: '+9647500000000',
    notes: null,
    purchaseInvoices: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Vendor;

  beforeEach(async () => {
    repository = createMockRepository<Vendor>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorsService,
        {
          provide: getRepositoryToken(Vendor),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<VendorsService>(VendorsService);
    jest.clearAllMocks();
    mockTenantContext('tenant-123');
  });

  it('creates vendor in current tenant', async () => {
    repository.save.mockResolvedValue(mockVendor);

    const result = await service.create({
      name: 'Acme Supplies',
      email: 'acme@test.com',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-123',
        name: 'Acme Supplies',
      }),
    );
    expect(result).toEqual(mockVendor);
  });

  it('lists vendors scoped to tenant', async () => {
    repository.find.mockResolvedValue([mockVendor]);

    const result = await service.findAll();

    expect(repository.find).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-123' },
      order: { name: 'ASC', createdAt: 'DESC' },
    });
    expect(result).toEqual([mockVendor]);
  });

  it('throws when vendor is missing in tenant', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.findById('missing-vendor')).rejects.toThrow(NotFoundException);
  });
});
