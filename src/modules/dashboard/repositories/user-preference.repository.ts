import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { UserPreference } from '../entities/user-preference.entity';

@Injectable()
export class UserPreferenceRepository extends TenantAwareRepository<UserPreference> {
  constructor(
    @InjectRepository(UserPreference)
    repository: Repository<UserPreference>,
  ) {
    super(repository);
  }
}
