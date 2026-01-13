/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { ForbiddenException, Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  DeepPartial,
  DeleteResult,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
  SaveOptions,
  UpdateResult,
} from 'typeorm';
import { TenantContextService } from '../services/tenant-context.service';

@Injectable()
export class TenantAwareRepository<T extends { tenantId: string }> {
  constructor(private readonly baseRepository?: Repository<T>) {}

  /**
   * Subclasses can override this getter to provide their own repository
   * instead of passing one to the constructor. This keeps the API
   * backward-compatible with both styles used in the codebase and tests.
   */
  protected get repository(): Repository<T> {
    if (!this.baseRepository) {
      throw new InternalServerErrorException('common.repository_not_provided');
    }
    return this.baseRepository;
  }

  private getTenantId(): string {
    return TenantContextService.getTenantIdOrThrow();
  }

  private applyTenantScope<O extends FindManyOptions<T> | FindOneOptions<T>>(options: O): O {
    const tenantId = this.getTenantId();
    const where = options.where || {};

    if (Array.isArray(where)) {
      return {
        ...options,
        where: where.map((w) => ({ ...w, tenantId })),
      } as O;
    }

    return {
      ...options,
      where: { ...where, tenantId },
    } as O;
  }

  create(entityLike: DeepPartial<T>): T {
    const tenantId = this.getTenantId();
    return this.repository.create({
      ...entityLike,
      tenantId,
    } as any) as unknown as T;
  }

  async save<E extends T | T[]>(entityOrEntities: E, options?: SaveOptions): Promise<E> {
    const tenantId = this.getTenantId();

    if (Array.isArray(entityOrEntities)) {
      for (const entity of entityOrEntities) {
        const typedEntity = entity as T & { tenantId: string };
        if (!typedEntity.tenantId) {
          typedEntity.tenantId = tenantId;
        } else if (typedEntity.tenantId !== tenantId) {
          throw new ForbiddenException('common.cross_tenant_save_attempt');
        }
      }
      return this.repository.save(entityOrEntities as any, options) as unknown as Promise<E>;
    }

    const entity = entityOrEntities as T & { tenantId: string };
    if (!entity.tenantId) {
      entity.tenantId = tenantId;
    } else if (entity.tenantId !== tenantId) {
      throw new ForbiddenException('common.cross_tenant_save_attempt');
    }
    return this.repository.save(entity, options) as unknown as Promise<E>;
  }

  async find(options?: FindManyOptions<T>): Promise<T[]> {
    return this.repository.find(this.applyTenantScope(options || {}));
  }

  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repository.findOne(this.applyTenantScope(options));
  }

  async findOneBy(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<T | null> {
    const tenantId = this.getTenantId();
    if (Array.isArray(where)) {
      return this.repository.findOneBy(where.map((w) => ({ ...w, tenantId }) as FindOptionsWhere<T>));
    }
    return this.repository.findOneBy({
      ...where,
      tenantId,
    } as FindOptionsWhere<T>);
  }

  async update(criteria: FindOptionsWhere<T>, partialEntity: DeepPartial<T>): Promise<UpdateResult> {
    const tenantId = this.getTenantId();
    // Ensure we only update records belonging to tenant
    const scopedCriteria = { ...criteria, tenantId };
    return this.repository.update(scopedCriteria as any, partialEntity as any);
  }

  async delete(criteria: FindOptionsWhere<T>): Promise<DeleteResult> {
    const tenantId = this.getTenantId();
    const scopedCriteria = { ...criteria, tenantId };
    return this.repository.delete(scopedCriteria);
  }

  async count(options?: FindManyOptions<T>): Promise<number> {
    return this.repository.count(this.applyTenantScope(options || {}));
  }

  createQueryBuilder(alias: string) {
    return this.repository.createQueryBuilder(alias);
  }

  async remove<E extends T | T[]>(entityOrEntities: E): Promise<E> {
    const tenantId = this.getTenantId();

    if (Array.isArray(entityOrEntities)) {
      for (const entity of entityOrEntities as Array<T & { tenantId: string }>) {
        if (!entity.tenantId) {
          entity.tenantId = tenantId;
        } else if (entity.tenantId !== tenantId) {
          throw new ForbiddenException('common.cross_tenant_remove_attempt');
        }
      }
      return this.repository.remove(entityOrEntities as any) as unknown as Promise<E>;
    }

    const entity = entityOrEntities as T & { tenantId: string };
    if (!entity.tenantId) {
      entity.tenantId = tenantId;
    } else if (entity.tenantId !== tenantId) {
      throw new ForbiddenException('common.cross_tenant_remove_attempt');
    }
    return this.repository.remove(entity) as unknown as Promise<E>;
  }

  async softRemove<E extends T | T[]>(entityOrEntities: E): Promise<E> {
    const tenantId = this.getTenantId();

    if (Array.isArray(entityOrEntities)) {
      for (const entity of entityOrEntities as Array<T & { tenantId: string }>) {
        if (!entity.tenantId) {
          entity.tenantId = tenantId;
        } else if (entity.tenantId !== tenantId) {
          throw new ForbiddenException('common.cross_tenant_remove_attempt');
        }
      }
      return this.repository.softRemove(entityOrEntities as any) as unknown as Promise<E>;
    }

    const entity = entityOrEntities as T;
    if (!entity.tenantId) {
      entity.tenantId = tenantId;
    } else if (entity.tenantId !== tenantId) {
      throw new ForbiddenException('common.cross_tenant_remove_attempt');
    }
    return this.repository.softRemove(entity) as unknown as Promise<E>;
  }
}
