import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { EntityManager } from 'typeorm';
import { Tenant } from '../../tenants/domain/entities/tenant.entity';
import { TenantPurgeService } from './tenant-purge.service';

describe('TenantPurgeService', () => {
  let service: TenantPurgeService;
  let manager: {
    query: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    manager = {
      query: jest.fn().mockResolvedValue({ rowCount: 0 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantPurgeService],
    }).compile();

    service = module.get(TenantPurgeService);
  });

  it('purges tenant-scoped tables in order and removes tenant row', async () => {
    await service.purgeTenantData('tenant-1', manager as unknown as EntityManager);

    expect(manager.query).toHaveBeenCalled();
    expect(manager.delete).toHaveBeenCalledWith(Tenant, { id: 'tenant-1' });
    const firstTableCall = manager.query.mock.calls[0]?.[0] as string;
    expect(firstTableCall).toContain('time_entries');
  });
});
