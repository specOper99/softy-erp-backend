import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { NotificationPreference } from '../entities/notification-preference.entity';

@Injectable()
export class NotificationPreferenceRepository extends TenantAwareRepository<NotificationPreference> {
  constructor(
    @InjectRepository(NotificationPreference)
    repository: Repository<NotificationPreference>,
  ) {
    super(repository);
  }
}
