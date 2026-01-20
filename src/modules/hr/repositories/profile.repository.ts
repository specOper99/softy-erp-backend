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
    return this.repository.createQueryBuilder(alias).andWhere(`${alias}.tenantId = :tenantId`, {
      tenantId: TenantContextService.getTenantIdOrThrow(),
    });
  }
}
