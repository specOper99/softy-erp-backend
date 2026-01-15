import { ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { Profile } from '../entities/profile.entity';

export class ProfileRepository extends TenantAwareRepository<Profile> {
  constructor(
    @InjectRepository(Profile)
    repository: Repository<Profile>,
  ) {
    super(repository);
  }

  createQueryBuilder(alias: string) {
    return this.repository.createQueryBuilder(alias).where(`${alias}.tenantId = :tenantId`, {
      tenantId: TenantContextService.getTenantIdOrThrow(),
    });
  }

  async softRemove<E extends Profile | Profile[]>(entityOrEntities: E): Promise<E> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    if (Array.isArray(entityOrEntities)) {
      for (const entity of entityOrEntities) {
        if (!(entity instanceof Profile)) throw new ForbiddenException('common.invalid_entity_type');
        if (entity.tenantId !== tenantId) {
          throw new ForbiddenException('common.cross_tenant_operation_denied');
        }
      }
      return this.repository.softRemove(entityOrEntities) as unknown as Promise<E>;
    }

    if (entityOrEntities.tenantId !== tenantId) {
      throw new ForbiddenException('common.cross_tenant_operation_denied');
    }
    return this.repository.softRemove(entityOrEntities) as unknown as Promise<E>;
  }

  async remove<E extends Profile | Profile[]>(entityOrEntities: E): Promise<E> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    if (Array.isArray(entityOrEntities)) {
      for (const entity of entityOrEntities) {
        if (!(entity instanceof Profile)) throw new ForbiddenException('common.invalid_entity_type');
        if (entity.tenantId !== tenantId) {
          throw new ForbiddenException('common.cross_tenant_operation_denied');
        }
      }
      return this.repository.remove(entityOrEntities) as unknown as Promise<E>;
    }

    if (entityOrEntities.tenantId !== tenantId) {
      throw new ForbiddenException('common.cross_tenant_operation_denied');
    }
    return this.repository.remove(entityOrEntities) as unknown as Promise<E>;
  }
}
