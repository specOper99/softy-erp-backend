/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { Injectable } from '@nestjs/common';
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
  constructor(private readonly repository: Repository<T>) {}

  private getTenantId(): string {
    return TenantContextService.getTenantIdOrThrow();
  }

  private applyTenantScope(
    options: FindManyOptions<T> | FindOneOptions<T>,
  ): any {
    const tenantId = this.getTenantId();
    const where = options.where || {};

    if (Array.isArray(where)) {
      return {
        ...options,
        where: where.map((w) => ({ ...w, tenantId })),
      };
    }

    return {
      ...options,
      where: { ...where, tenantId },
    };
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
      throw new Error(
        `Security Error: Attempted to save entity for tenant ${entity.tenantId} from context ${this.getTenantId()}`,
      );
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
}
