import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { PackageItem } from '../entities/package-item.entity';

@Injectable()
export class PackageItemRepository extends TenantAwareRepository<PackageItem> {
  constructor(
    @InjectRepository(PackageItem)
    repository: Repository<PackageItem>,
  ) {
    super(repository);
  }
}
