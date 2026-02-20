import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { TaskTypeEligibility } from '../entities/task-type-eligibility.entity';

@Injectable()
export class TaskTypeEligibilityRepository extends TenantAwareRepository<TaskTypeEligibility> {
  constructor(
    @InjectRepository(TaskTypeEligibility)
    repository: Repository<TaskTypeEligibility>,
  ) {
    super(repository);
  }
}
