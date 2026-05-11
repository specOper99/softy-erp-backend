import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { ProcessingTypeEligibility } from '../entities/processing-type-eligibility.entity';

@Injectable()
export class ProcessingTypeEligibilityRepository extends TenantAwareRepository<ProcessingTypeEligibility> {
  constructor(
    @InjectRepository(ProcessingTypeEligibility)
    repository: Repository<ProcessingTypeEligibility>,
  ) {
    super(repository);
  }
}
