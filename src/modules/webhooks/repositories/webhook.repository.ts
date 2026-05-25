import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { Webhook } from '../entities/webhook.entity';

@Injectable()
export class WebhookRepository extends TenantAwareRepository<Webhook> {
  constructor(
    @InjectRepository(Webhook)
    repository: Repository<Webhook>,
  ) {
    super(repository);
  }
}
