import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { PurchaseInvoice } from '../entities/purchase-invoice.entity';

@Injectable()
export class PurchaseInvoiceRepository extends TenantAwareRepository<PurchaseInvoice> {
  constructor(
    @InjectRepository(PurchaseInvoice)
    repository: Repository<PurchaseInvoice>,
  ) {
    super(repository);
  }
}
