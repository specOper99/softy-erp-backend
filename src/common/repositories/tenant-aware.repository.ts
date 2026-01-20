/**
 * TenantAwareRepository
 *
 * A base repository that automatically scopes all database queries to the current tenant,
 * preventing cross-tenant data access in a multi-tenant SaaS application.
 *
 * ## Type Safety Note (L-02)
 *
 * This file intentionally uses type assertions and `as unknown as T` casts in several places:
 *
 * 1. **TypeORM Generic Constraints**: TypeORM's generic types for `save`, `softRemove`,
 *    and `remove` have complex conditional type constraints that don't compose well
 *    with our tenant enforcement wrapper logic.
 *
 * 2. **Interception Pattern**: The casts allow us to intercept all repository operations,
 *    validate tenant ownership, and delegate to the underlying TypeORM repository.
 *
 * 3. **Runtime Safety**: Despite the compile-time casts, runtime safety is ensured by
 *    explicit `tenantId` validation before every mutating operation. Cross-tenant
 *    operations throw `ForbiddenException`.
 *
 * 4. **Controlled Trust Boundary**: These casts exist at the boundary between our
 *    application code and TypeORM internals - not in business logic.
 *
 * Alternative approaches (separate methods per entity type) would significantly
 * increase code duplication without improving runtime safety.
 */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { ForbiddenException, Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  DeepPartial,
  DeleteResult,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  QueryDeepPartialEntity,
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
    } as DeepPartial<T>);
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
      return this.repository.save(entityOrEntities as unknown as DeepPartial<T>[], options) as Promise<E>;
    }

    const entity = entityOrEntities as T & { tenantId: string };
    if (!entity.tenantId) {
      entity.tenantId = tenantId;
    } else if (entity.tenantId !== tenantId) {
      throw new ForbiddenException('common.cross_tenant_save_attempt');
    }
    return this.repository.save(entity, options) as Promise<E>;
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
    return this.repository.update(scopedCriteria as FindOptionsWhere<T>, partialEntity as QueryDeepPartialEntity<T>);
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
    const tenantId = this.getTenantId();
    return this.repository.createQueryBuilder(alias).andWhere(`${alias}.tenantId = :tenantId`, { tenantId });
  }

  async remove<E extends T | T[]>(entityOrEntities: E): Promise<E> {
    return this.handleRemoval(entityOrEntities, 'remove');
  }

  async softRemove<E extends T | T[]>(entityOrEntities: E): Promise<E> {
    return this.handleRemoval(entityOrEntities, 'softRemove');
  }

  private async handleRemoval<E extends T | T[]>(entityOrEntities: E, action: 'remove' | 'softRemove'): Promise<E> {
    const tenantId = this.getTenantId();

    if (Array.isArray(entityOrEntities)) {
      this.validateTenantOwnerships(entityOrEntities as Array<T & { tenantId: string }>, tenantId);
      // @ts-expect-error - TypeORM method overload doesn't play well with generic type
      return await this.repository[action](entityOrEntities);
    }

    const entity = entityOrEntities as T & { tenantId: string };
    this.validateTenantOwnership(entity, tenantId);
    // @ts-expect-error - TypeORM method overload doesn't play well with generic type
    return await this.repository[action](entity);
  }

  private validateTenantOwnership(entity: T & { tenantId: string }, tenantId: string): void {
    if (!entity.tenantId) {
      entity.tenantId = tenantId;
    } else if (entity.tenantId !== tenantId) {
      throw new ForbiddenException('common.cross_tenant_remove_attempt');
    }
  }

  private validateTenantOwnerships(entities: Array<T & { tenantId: string }>, tenantId: string): void {
    for (const entity of entities) {
      this.validateTenantOwnership(entity, tenantId);
    }
  }
}
