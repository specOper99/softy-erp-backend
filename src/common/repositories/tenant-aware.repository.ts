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
 *    operations throw `TenantMismatchException`.
 *
 * 4. **Controlled Trust Boundary**: These casts exist at the boundary between our
 *    application code and TypeORM internals - not in business logic.
 *
 * Alternative approaches (separate methods per entity type) would significantly
 * increase code duplication without improving runtime safety.
 */

import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import {
  DeepPartial,
  DeleteResult,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  QueryDeepPartialEntity,
  Repository,
  SaveOptions,
  SelectQueryBuilder,
  UpdateResult,
} from 'typeorm';
import { TenantMismatchException, TenantMismatchOperation } from '../exceptions/domain.exceptions';
import { TenantContextService } from '../services/tenant-context.service';

@Injectable()
export class TenantAwareRepository<T extends { tenantId: string }> {
  protected readonly logger = new Logger(this.constructor.name);

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

  /**
   * Get the entity name for logging and error messages.
   */
  protected get entityName(): string {
    return this.repository.metadata.name;
  }

  private getTenantId(): string {
    return TenantContextService.getTenantIdOrThrow();
  }

  /**
   * Safely get tenant ID, returning undefined if not in tenant context.
   * Useful for checking if we're in a tenant-scoped context.
   */
  protected getTenantIdSafe(): string | undefined {
    return TenantContextService.getTenantId();
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
          throw new TenantMismatchException({
            contextTenantId: tenantId,
            entityTenantId: typedEntity.tenantId,
            operation: TenantMismatchOperation.CREATE,
            entityType: this.entityName,
          });
        }
      }
      return this.repository.save(entityOrEntities as unknown as DeepPartial<T>[], options) as Promise<E>;
    }

    const entity = entityOrEntities as T & { tenantId: string };
    if (!entity.tenantId) {
      entity.tenantId = tenantId;
    } else if (entity.tenantId !== tenantId) {
      throw new TenantMismatchException({
        contextTenantId: tenantId,
        entityTenantId: entity.tenantId,
        operation: TenantMismatchOperation.CREATE,
        entityType: this.entityName,
      });
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
    this.validateTenantOwnership(
      entity,
      tenantId,
      action === 'remove' ? TenantMismatchOperation.DELETE : TenantMismatchOperation.DELETE,
    );
    // @ts-expect-error - TypeORM method overload doesn't play well with generic type
    return await this.repository[action](entity);
  }

  private validateTenantOwnership(
    entity: T & { tenantId: string },
    tenantId: string,
    operation: TenantMismatchOperation = TenantMismatchOperation.UPDATE,
  ): void {
    if (!entity.tenantId) {
      entity.tenantId = tenantId;
    } else if (entity.tenantId !== tenantId) {
      throw new TenantMismatchException({
        contextTenantId: tenantId,
        entityTenantId: entity.tenantId,
        operation,
        entityType: this.entityName,
        entityId: (entity as unknown as { id?: string }).id,
      });
    }
  }

  private validateTenantOwnerships(
    entities: Array<T & { tenantId: string }>,
    tenantId: string,
    operation: TenantMismatchOperation = TenantMismatchOperation.UPDATE,
  ): void {
    for (const entity of entities) {
      this.validateTenantOwnership(entity, tenantId, operation);
    }
  }

  // ==================== Enhanced Query Builder Methods ====================

  /**
   * Creates a tenant-scoped query builder for streaming operations.
   * Use this for exports, reports, and other streaming scenarios.
   *
   * @example
   * ```typescript
   * const stream = await this.repo.createStreamQueryBuilder('t')
   *   .orderBy('t.createdAt', 'DESC')
   *   .stream();
   * ```
   */
  createStreamQueryBuilder(alias: string): SelectQueryBuilder<T> {
    const tenantId = this.getTenantId();
    this.logger.debug(`Creating stream query builder for ${this.entityName} with tenant ${tenantId}`);
    return this.repository.createQueryBuilder(alias).andWhere(`${alias}.tenantId = :tenantId`, { tenantId });
  }

  /**
   * Creates a tenant-scoped query builder for aggregation operations.
   * Includes tenant validation logging for audit purposes.
   */
  createAggregateQueryBuilder(alias: string): SelectQueryBuilder<T> {
    const tenantId = this.getTenantId();
    this.logger.debug(`Creating aggregate query builder for ${this.entityName} with tenant ${tenantId}`);
    return this.repository.createQueryBuilder(alias).andWhere(`${alias}.tenantId = :tenantId`, { tenantId });
  }

  /**
   * Execute a raw query within tenant scope.
   * WARNING: Use sparingly - prefer typed methods when possible.
   * The query should use $1, $2 etc for parameters and tenantId is injected as the last parameter.
   */
  async queryWithTenantScope<R>(query: string, parameters: unknown[] = []): Promise<R[]> {
    const tenantId = this.getTenantId();
    return this.repository.query(query, [...parameters, tenantId]) as Promise<R[]>;
  }

  /**
   * Validates that an entity belongs to the current tenant.
   * Useful for permission checks before operations.
   */
  assertTenantOwnership(entity: T, operation: TenantMismatchOperation = TenantMismatchOperation.READ): void {
    const tenantId = this.getTenantId();
    if (entity.tenantId !== tenantId) {
      throw new TenantMismatchException({
        contextTenantId: tenantId,
        entityTenantId: entity.tenantId,
        operation,
        entityType: this.entityName,
        entityId: (entity as unknown as { id?: string }).id,
      });
    }
  }

  /**
   * Find one entity by ID with tenant validation.
   * Throws TenantMismatchException if entity exists but belongs to different tenant.
   */
  async findOneByIdOrFail(id: string): Promise<T> {
    const tenantId = this.getTenantId();
    const entity = await this.repository.findOne({
      where: { id, tenantId } as unknown as FindOptionsWhere<T>,
    });
    if (!entity) {
      throw new Error(`${this.entityName} with ID ${id} not found`);
    }
    return entity;
  }

  /**
   * Check if an entity with the given criteria exists within the tenant scope.
   */
  async exists(where: FindOptionsWhere<T>): Promise<boolean> {
    const count = await this.count({ where });
    return count > 0;
  }
}
