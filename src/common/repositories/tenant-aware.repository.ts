import { FindManyOptions, FindOneOptions, Repository } from 'typeorm';
import { TenantContextService } from '../services/tenant-context.service';

/**
 * Interface for entities that support multi-tenancy
 */
export interface TenantEntity {
  tenantId: string;
}

/**
 * Abstract base class for tenant-aware repository operations.
 * Provides common methods that automatically filter by tenant context.
 *
 * Usage:
 * ```typescript
 * @Injectable()
 * export class BookingsRepository extends TenantAwareRepository<Booking> {
 *   constructor(@InjectRepository(Booking) private repo: Repository<Booking>) {
 *     super();
 *   }
 *   protected get repository() { return this.repo; }
 * }
 * ```
 */
export abstract class TenantAwareRepository<T extends TenantEntity> {
  /**
   * Get the underlying TypeORM repository
   */
  protected abstract get repository(): Repository<T>;

  /**
   * Get the current tenant ID from context
   */
  protected getTenantId(): string | undefined {
    return TenantContextService.getTenantId();
  }

  /**
   * Helper to merge tenantId into where clause
   */
  private mergeTenantId(
    where?: FindManyOptions<T>['where'],
  ): FindManyOptions<T>['where'] {
    if (!where) {
      return {
        tenantId: this.getTenantId(),
      } as unknown as FindManyOptions<T>['where'];
    }
    if (Array.isArray(where)) {
      return where.map((w) => ({ ...w, tenantId: this.getTenantId() }));
    }
    return { ...where, tenantId: this.getTenantId() };
  }

  /**
   * Find all entities for the current tenant
   */
  async findAllForTenant(options?: FindManyOptions<T>): Promise<T[]> {
    const tenantId = this.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not available');
    }

    const where = this.mergeTenantId(options?.where);
    return this.repository.find({ ...options, where });
  }

  /**
   * Find one entity for the current tenant
   */
  async findOneForTenant(options: FindOneOptions<T>): Promise<T | null> {
    const tenantId = this.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not available');
    }

    const where = this.mergeTenantId(options.where);
    return this.repository.findOne({ ...options, where });
  }

  /**
   * Count entities for the current tenant
   */
  async countForTenant(options?: FindManyOptions<T>): Promise<number> {
    const tenantId = this.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not available');
    }

    const where = this.mergeTenantId(options?.where);
    return this.repository.count({ ...options, where });
  }
}
