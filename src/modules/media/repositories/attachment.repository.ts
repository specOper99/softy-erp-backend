import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { Attachment } from '../entities/attachment.entity';

/**
 * Tenant-aware repository for Attachment entity.
 * Automatically scopes all queries to the current tenant context.
 */
@Injectable()
export class AttachmentRepository extends TenantAwareRepository<Attachment> {
  constructor(
    @InjectRepository(Attachment)
    repository: Repository<Attachment>,
  ) {
    super(repository);
  }
}
