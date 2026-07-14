import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { MockRepository } from '../../../../test/helpers/mock-factories';
import { createMockRepository, mockTenantContext } from '../../../../test/helpers/mock-factories';
import { TENANT_REPO_VENDOR } from '../../../common/constants/tenant-repo.tokens';
import type { Vendor } from '../domain/entities';
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
          provide: TENANT_REPO_VENDOR,
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
        name: 'Acme Supplies',
      }),
    );
    expect(result).toEqual(mockVendor);
  });

  it('lists vendors scoped to tenant', async () => {
    repository.find.mockResolvedValue([mockVendor]);

    const result = await service.findAll();

    expect(repository.find).toHaveBeenCalledWith({
      order: { name: 'ASC', createdAt: 'DESC' },
    });
    expect(result).toEqual([mockVendor]);
  });

  it('throws when vendor is missing in tenant', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.findById('missing-vendor')).rejects.toThrow(NotFoundException);
  });

  it('does not expose vendor id owned by another tenant', async () => {
    // TenantAwareRepository scopes findOne by tenantId; cross-tenant rows are invisible.
    repository.findOne.mockResolvedValue(null);

    await expect(service.findById('vendor-owned-by-other-tenant')).rejects.toThrow(NotFoundException);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'vendor-owned-by-other-tenant' },
    });
    expect(repository.save).not.toHaveBeenCalled();
  });
});
