import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { Vendor } from '../entities/vendor.entity';

@Injectable()
export class VendorRepository extends TenantAwareRepository<Vendor> {
  constructor(
    @InjectRepository(Vendor)
    repository: Repository<Vendor>,
  ) {
    super(repository);
  }
}
