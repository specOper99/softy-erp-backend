/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
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

  private applyTenantScope<O extends FindManyOptions<T> | FindOneOptions<T>>(
    options: O,
  ): O {
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

  async save(entity: T, options?: SaveOptions): Promise<T> {
    // Ensure tenantId is set before saving
    if (!entity.tenantId) {
      entity.tenantId = this.getTenantId();
    } else if (entity.tenantId !== this.getTenantId()) {
      // Prevent cross-tenant save attempts if someone tries to be sneaky
      throw new ForbiddenException('common.cross_tenant_save_attempt');
    }
    return this.repository.save(entity, options);
  }

  async find(options?: FindManyOptions<T>): Promise<T[]> {
    return this.repository.find(this.applyTenantScope(options || {}));
  }

  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repository.findOne(this.applyTenantScope(options));
  }

  async findOneBy(
    where: FindOptionsWhere<T> | FindOptionsWhere<T>[],
  ): Promise<T | null> {
    const tenantId = this.getTenantId();
    if (Array.isArray(where)) {
      return this.repository.findOneBy(
        where.map((w) => ({ ...w, tenantId }) as FindOptionsWhere<T>),
      );
    }
    return this.repository.findOneBy({
      ...where,
      tenantId,
    } as FindOptionsWhere<T>);
  }

  async update(
    criteria: FindOptionsWhere<T>,
    partialEntity: DeepPartial<T>,
  ): Promise<UpdateResult> {
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

  async remove(entity: T): Promise<T> {
    if (!entity.tenantId) {
      entity.tenantId = this.getTenantId();
    } else if (entity.tenantId !== this.getTenantId()) {
      throw new ForbiddenException('common.cross_tenant_remove_attempt');
    }
    return this.repository.remove(entity);
  }
}
