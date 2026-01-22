import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { WebhookDelivery } from '../entities/webhook-delivery.entity';

@Injectable()
export class WebhookDeliveryRepository extends TenantAwareRepository<WebhookDelivery> {
  constructor(
    @InjectRepository(WebhookDelivery)
    repository: Repository<WebhookDelivery>,
  ) {
    super(repository);
  }
}
