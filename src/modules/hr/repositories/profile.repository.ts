import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { Profile } from '../entities/profile.entity';

export class ProfileRepository extends TenantAwareRepository<Profile> {
  constructor(
    @InjectRepository(Profile)
    repository: Repository<Profile>,
  ) {
    super(repository);
  }

  createQueryBuilder(alias: string) {
    return super.createQueryBuilder(alias);
  }
}
