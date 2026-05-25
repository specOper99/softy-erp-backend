import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { PrivacyRequest } from '../entities/privacy-request.entity';

@Injectable()
export class PrivacyRequestRepository extends TenantAwareRepository<PrivacyRequest> {
  constructor(
    @InjectRepository(PrivacyRequest)
    repository: Repository<PrivacyRequest>,
  ) {
    super(repository);
  }
}
