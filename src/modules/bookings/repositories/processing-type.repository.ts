import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { ProcessingType } from '../entities/processing-type.entity';

@Injectable()
export class ProcessingTypeRepository extends TenantAwareRepository<ProcessingType> {
  constructor(
    @InjectRepository(ProcessingType)
    repository: Repository<ProcessingType>,
  ) {
    super(repository);
  }
}
