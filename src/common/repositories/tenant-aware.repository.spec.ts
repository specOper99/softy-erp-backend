import { Repository } from 'typeorm';
import { TenantContextService } from '../services/tenant-context.service';
import { TenantAwareRepository, TenantEntity } from './tenant-aware.repository';

// Concrete implementation for testing abstract class
class TestEntity implements TenantEntity {
  id: string;
  tenantId: string;
  name: string;
}

class TestRepository extends TenantAwareRepository<TestEntity> {
  constructor(private readonly repo: Repository<TestEntity>) {
    super();
  }
  protected get repository(): Repository<TestEntity> {
    return this.repo;
  }
}

describe('TenantAwareRepository', () => {
  let repository: TestRepository;
  let mockTypeOrmRepository: Repository<TestEntity>;

  beforeEach(() => {
    // Log current test (helps diagnose ordering-dependent failures in full suite)

    console.log('Running TenantAwareRepository test:', expect.getState().currentTestName);

    // Mock the inner TypeORM repository
    mockTypeOrmRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    } as unknown as Repository<TestEntity>;

    repository = new TestRepository(mockTypeOrmRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('find (tenant-scoped)', () => {
    it('should find entities with tenantId filter and existing options', async () => {
      const options = { where: { name: 'test' }, relations: ['child'] };
      await TenantContextService.run('default-tenant', async () => {
        await repository.find(options as any);
      });

      expect(mockTypeOrmRepository.find).toHaveBeenCalledWith({
        ...options,
        where: {
          ...options.where,
          tenantId: 'default-tenant',
        },
      });
    });

    it('should find entities with tenantId filter when no options provided', async () => {
      await TenantContextService.run('default-tenant', async () => {
        await repository.find();
      });

      expect(mockTypeOrmRepository.find).toHaveBeenCalledWith({
        where: {
          tenantId: 'default-tenant',
        },
      });
    });

    it('should throw error if tenant context is missing', async () => {
      jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockImplementation(() => {
        throw new Error('Tenant context not available');
      });
      await expect(repository.find()).rejects.toThrow('Tenant context not available');
    });
  });

  describe('findOne (tenant-scoped)', () => {
    it('should find one entity with tenantId filter', async () => {
      const options = { where: { id: '1' } };
      await TenantContextService.run('default-tenant', async () => {
        await repository.findOne(options as any);
      });

      expect(mockTypeOrmRepository.findOne).toHaveBeenCalledWith({
        ...options,
        where: {
          ...options.where,
          tenantId: 'default-tenant',
        },
      });
    });

    it('should throw error if tenant context is missing', async () => {
      jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockImplementation(() => {
        throw new Error('Tenant context not available');
      });
      await expect(repository.findOne({ where: { id: '1' } } as any)).rejects.toThrow('Tenant context not available');
    });
  });

  describe('count (tenant-scoped)', () => {
    it('should count entities with tenantId filter', async () => {
      const options = { where: { name: 'test' } };
      await TenantContextService.run('default-tenant', async () => {
        await repository.count(options as any);
      });

      expect(mockTypeOrmRepository.count).toHaveBeenCalledWith({
        ...options,
        where: {
          ...options.where,
          tenantId: 'default-tenant',
        },
      });
    });

    it('should count entities with tenantId filter when no options provided', async () => {
      await TenantContextService.run('default-tenant', async () => {
        await repository.count();
      });

      expect(mockTypeOrmRepository.count).toHaveBeenCalledWith({
        where: {
          tenantId: 'default-tenant',
        },
      });
    });

    it('should throw error if tenant context is missing', async () => {
      jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockImplementation(() => {
        throw new Error('Tenant context not available');
      });
      await expect(repository.count()).rejects.toThrow('Tenant context not available');
    });
  });
});
