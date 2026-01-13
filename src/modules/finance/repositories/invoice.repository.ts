import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { Invoice } from '../entities/invoice.entity';

@Injectable()
export class InvoiceRepository extends TenantAwareRepository<Invoice> {
  constructor(
    @InjectRepository(Invoice)
    repository: Repository<Invoice>,
  ) {
    super(repository);
  }
}
