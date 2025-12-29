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
    // Mock the inner TypeORM repository
    mockTypeOrmRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    } as unknown as Repository<TestEntity>;

    repository = new TestRepository(mockTypeOrmRepository);

    // Default mock for TenantContextService
    jest
      .spyOn(TenantContextService, 'getTenantId')
      .mockReturnValue('default-tenant');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAllForTenant', () => {
    it('should find entities with tenantId filter and existing options', async () => {
      const options = { where: { name: 'test' }, relations: ['child'] };
      await repository.findAllForTenant(options);

      expect(mockTypeOrmRepository.find).toHaveBeenCalledWith({
        ...options,
        where: {
          ...options.where,
          tenantId: 'default-tenant',
        },
      });
    });

    it('should find entities with tenantId filter when no options provided', async () => {
      await repository.findAllForTenant();

      expect(mockTypeOrmRepository.find).toHaveBeenCalledWith({
        where: {
          tenantId: 'default-tenant',
        },
      });
    });

    it('should throw error if tenant context is missing', async () => {
      jest
        .spyOn(TenantContextService, 'getTenantId')
        .mockReturnValue(undefined);
      await expect(repository.findAllForTenant()).rejects.toThrow(
        'Tenant context not available',
      );
    });
  });

  describe('findOneForTenant', () => {
    it('should find one entity with tenantId filter', async () => {
      const options = { where: { id: '1' } };
      await repository.findOneForTenant(options);

      expect(mockTypeOrmRepository.findOne).toHaveBeenCalledWith({
        ...options,
        where: {
          ...options.where,
          tenantId: 'default-tenant',
        },
      });
    });

    it('should throw error if tenant context is missing', async () => {
      jest
        .spyOn(TenantContextService, 'getTenantId')
        .mockReturnValue(undefined);
      await expect(
        repository.findOneForTenant({ where: { id: '1' } }),
      ).rejects.toThrow('Tenant context not available');
    });
  });

  describe('countForTenant', () => {
    it('should count entities with tenantId filter', async () => {
      const options = { where: { name: 'test' } };
      await repository.countForTenant(options);

      expect(mockTypeOrmRepository.count).toHaveBeenCalledWith({
        ...options,
        where: {
          ...options.where,
          tenantId: 'default-tenant',
        },
      });
    });

    it('should count entities with tenantId filter when no options provided', async () => {
      await repository.countForTenant();

      expect(mockTypeOrmRepository.count).toHaveBeenCalledWith({
        where: {
          tenantId: 'default-tenant',
        },
      });
    });

    it('should throw error if tenant context is missing', async () => {
      jest
        .spyOn(TenantContextService, 'getTenantId')
        .mockReturnValue(undefined);
      await expect(repository.countForTenant()).rejects.toThrow(
        'Tenant context not available',
      );
    });
  });
});
