import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { DeepPartial, FindManyOptions, FindOneOptions, FindOptionsWhere, Repository } from 'typeorm';
import { TenantContextService } from '../services/tenant-context.service';
import { TenantAwareRepository } from './tenant-aware.repository';

// Concrete implementation for testing abstract class
class TestEntity {
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
      findOneBy: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
      remove: jest.fn(),
      softRemove: jest.fn(),
      metadata: { name: 'TestEntity' },
    } as unknown as Repository<TestEntity>;

    repository = new TestRepository(mockTypeOrmRepository);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('find (tenant-scoped)', () => {
    it('should find entities with tenantId filter and existing options', async () => {
      const options: FindManyOptions<TestEntity> = { where: { name: 'test' }, relations: ['child'] };
      await TenantContextService.run('default-tenant', async () => {
        await repository.find(options);
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

    it('should apply tenantId to each where clause when where is an array', async () => {
      const options: FindManyOptions<TestEntity> = {
        where: [{ id: '1' }, { name: 'test' }],
      };

      await TenantContextService.run('default-tenant', async () => {
        await repository.find(options);
      });

      expect(mockTypeOrmRepository.find).toHaveBeenCalledWith({
        ...options,
        where: [
          { id: '1', tenantId: 'default-tenant' },
          { name: 'test', tenantId: 'default-tenant' },
        ],
      });
    });
  });

  describe('findOne (tenant-scoped)', () => {
    it('should find one entity with tenantId filter', async () => {
      const options: FindOneOptions<TestEntity> = { where: { id: '1' } };
      await TenantContextService.run('default-tenant', async () => {
        await repository.findOne(options);
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
      await expect(repository.findOne({ where: { id: '1' } })).rejects.toThrow('Tenant context not available');
    });

    it('should apply tenantId to each where clause when where is an array', async () => {
      const options: FindOneOptions<TestEntity> = {
        where: [{ id: '1' }, { name: 'test' }],
      };

      await TenantContextService.run('default-tenant', async () => {
        await repository.findOne(options);
      });

      expect(mockTypeOrmRepository.findOne).toHaveBeenCalledWith({
        ...options,
        where: [
          { id: '1', tenantId: 'default-tenant' },
          { name: 'test', tenantId: 'default-tenant' },
        ],
      });
    });
  });

  describe('count (tenant-scoped)', () => {
    it('should count entities with tenantId filter', async () => {
      const options: FindManyOptions<TestEntity> = { where: { name: 'test' } };
      await TenantContextService.run('default-tenant', async () => {
        await repository.count(options);
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

    it('should apply tenantId to each where clause when where is an array', async () => {
      const options: FindManyOptions<TestEntity> = {
        where: [{ id: '1' }, { name: 'test' }],
      };

      await TenantContextService.run('default-tenant', async () => {
        await repository.count(options);
      });

      expect(mockTypeOrmRepository.count).toHaveBeenCalledWith({
        ...options,
        where: [
          { id: '1', tenantId: 'default-tenant' },
          { name: 'test', tenantId: 'default-tenant' },
        ],
      });
    });
  });

  describe('repository getter', () => {
    it('should throw if repository is not provided and not overridden', () => {
      // Use baseRepository constructor style to avoid overriding getter
      const repo = new TenantAwareRepository<TestEntity>();
      expect(() => (repo as unknown as { repository: Repository<TestEntity> }).repository).toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('create (tenant enforced)', () => {
    it('should inject tenantId into created entity', () => {
      const entityLike = { id: '1', name: 'test' } as unknown as Partial<TestEntity>;

      TenantContextService.run('default-tenant', () => {
        repository.create(entityLike);
      });

      expect(mockTypeOrmRepository.create).toHaveBeenCalledWith({
        ...entityLike,
        tenantId: 'default-tenant',
      });
    });

    it('should override provided tenantId to current tenant', () => {
      const entityLike = { id: '1', name: 'test', tenantId: 'other-tenant' } as unknown as Partial<TestEntity>;

      TenantContextService.run('default-tenant', () => {
        repository.create(entityLike);
      });

      expect(mockTypeOrmRepository.create).toHaveBeenCalledWith({
        ...entityLike,
        tenantId: 'default-tenant',
      });
    });
  });

  describe('save (tenant enforced)', () => {
    it('should set tenantId on entity without tenantId', async () => {
      const entity = { id: '1', name: 'test' } as unknown as TestEntity;

      await TenantContextService.run('default-tenant', async () => {
        await repository.save(entity);
      });

      expect(entity.tenantId).toBe('default-tenant');
      expect(mockTypeOrmRepository.save).toHaveBeenCalledWith(entity, undefined);
    });

    it('should throw if entity tenantId mismatches current tenant', async () => {
      const entity = { id: '1', name: 'test', tenantId: 'other-tenant' } as unknown as TestEntity;

      await TenantContextService.run('default-tenant', async () => {
        await expect(repository.save(entity)).rejects.toThrow(ForbiddenException);
      });
    });

    it('should set tenantId on each entity when saving arrays', async () => {
      const entities = [
        { id: '1', name: 'a' },
        { id: '2', name: 'b' },
      ] as unknown as TestEntity[];

      await TenantContextService.run('default-tenant', async () => {
        await repository.save(entities);
      });

      expect(entities[0]!.tenantId).toBe('default-tenant');
      expect(entities[1]!.tenantId).toBe('default-tenant');
      expect(mockTypeOrmRepository.save).toHaveBeenCalledWith(entities, undefined);
    });

    it('should throw if any entity in array mismatches current tenant', async () => {
      const entities = [
        { id: '1', name: 'a', tenantId: 'default-tenant' },
        { id: '2', name: 'b', tenantId: 'other-tenant' },
      ] as unknown as TestEntity[];

      await TenantContextService.run('default-tenant', async () => {
        await expect(repository.save(entities)).rejects.toThrow(ForbiddenException);
      });
    });
  });

  describe('findOneBy (tenant-scoped)', () => {
    it('should apply tenantId when where is an object', async () => {
      await TenantContextService.run('default-tenant', async () => {
        await repository.findOneBy({ id: '1' } as FindOptionsWhere<TestEntity>);
      });

      expect(mockTypeOrmRepository.findOneBy).toHaveBeenCalledWith({ id: '1', tenantId: 'default-tenant' });
    });

    it('should apply tenantId to each where clause when where is an array', async () => {
      await TenantContextService.run('default-tenant', async () => {
        await repository.findOneBy([{ id: '1' }, { name: 'test' }] as FindOptionsWhere<TestEntity>[]);
      });

      expect(mockTypeOrmRepository.findOneBy).toHaveBeenCalledWith([
        { id: '1', tenantId: 'default-tenant' },
        { name: 'test', tenantId: 'default-tenant' },
      ]);
    });
  });

  describe('update/delete (tenant-scoped)', () => {
    it('should scope update criteria by tenantId', async () => {
      await TenantContextService.run('default-tenant', async () => {
        await repository.update(
          { id: '1' } as FindOptionsWhere<TestEntity>,
          { name: 'updated' } as DeepPartial<TestEntity>,
        );
      });

      expect(mockTypeOrmRepository.update).toHaveBeenCalledWith(
        { id: '1', tenantId: 'default-tenant' },
        { name: 'updated' },
      );
    });

    it('should scope delete criteria by tenantId', async () => {
      await TenantContextService.run('default-tenant', async () => {
        await repository.delete({ id: '1' } as FindOptionsWhere<TestEntity>);
      });

      expect(mockTypeOrmRepository.delete).toHaveBeenCalledWith({ id: '1', tenantId: 'default-tenant' });
    });
  });

  describe('createQueryBuilder (tenant-scoped)', () => {
    it('should apply tenant filter to query builder', () => {
      const qb = {
        andWhere: jest.fn().mockReturnThis(),
      };
      (mockTypeOrmRepository.createQueryBuilder as unknown as jest.Mock).mockReturnValue(qb);

      TenantContextService.run('default-tenant', () => {
        repository.createQueryBuilder('t');
      });

      expect(mockTypeOrmRepository.createQueryBuilder).toHaveBeenCalledWith('t');
      expect(qb.andWhere).toHaveBeenCalledWith('t.tenantId = :tenantId', { tenantId: 'default-tenant' });
    });
  });

  describe('remove/softRemove (tenant enforced)', () => {
    it('should set tenantId when removing entity missing tenantId', async () => {
      const entity = { id: '1', name: 'test' } as unknown as TestEntity;
      (mockTypeOrmRepository.remove as unknown as jest.Mock).mockResolvedValue(entity);

      await TenantContextService.run('default-tenant', async () => {
        await repository.remove(entity);
      });

      expect(entity.tenantId).toBe('default-tenant');
      expect(mockTypeOrmRepository.remove).toHaveBeenCalledWith(entity);
    });

    it('should throw when removing cross-tenant entity', async () => {
      const entity = { id: '1', name: 'test', tenantId: 'other-tenant' } as unknown as TestEntity;

      await TenantContextService.run('default-tenant', async () => {
        await expect(repository.remove(entity)).rejects.toThrow(ForbiddenException);
      });
    });

    it('should validate all entities when removing arrays', async () => {
      const entities = [
        { id: '1', name: 'a' },
        { id: '2', name: 'b' },
      ] as unknown as TestEntity[];
      (mockTypeOrmRepository.remove as unknown as jest.Mock).mockResolvedValue(entities);

      await TenantContextService.run('default-tenant', async () => {
        await repository.remove(entities);
      });

      expect(entities[0]!.tenantId).toBe('default-tenant');
      expect(entities[1]!.tenantId).toBe('default-tenant');
      expect(mockTypeOrmRepository.remove).toHaveBeenCalledWith(entities);
    });

    it('should throw if any entity in array mismatches current tenant', async () => {
      const entities = [
        { id: '1', name: 'a', tenantId: 'default-tenant' },
        { id: '2', name: 'b', tenantId: 'other-tenant' },
      ] as unknown as TestEntity[];

      await TenantContextService.run('default-tenant', async () => {
        await expect(repository.remove(entities)).rejects.toThrow(ForbiddenException);
      });
    });

    it('should apply tenant validation for softRemove', async () => {
      const entity = { id: '1', name: 'test' } as unknown as TestEntity;
      (mockTypeOrmRepository.softRemove as unknown as jest.Mock).mockResolvedValue(entity);

      await TenantContextService.run('default-tenant', async () => {
        await repository.softRemove(entity);
      });

      expect(entity.tenantId).toBe('default-tenant');
      expect(mockTypeOrmRepository.softRemove).toHaveBeenCalledWith(entity);
    });
  });
});
