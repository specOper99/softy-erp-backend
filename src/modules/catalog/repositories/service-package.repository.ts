import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { ServicePackage } from '../entities/service-package.entity';

@Injectable()
export class ServicePackageRepository extends TenantAwareRepository<ServicePackage> {
  constructor(
    @InjectRepository(ServicePackage)
    repository: Repository<ServicePackage>,
  ) {
    super(repository);
  }
}
