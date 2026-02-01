import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { AuditLog } from '../entities/audit-log.entity';

@Injectable()
export class AuditLogRepository extends TenantAwareRepository<AuditLog> {
  constructor(
    @InjectRepository(AuditLog)
    repository: Repository<AuditLog>,
  ) {
    super(repository);
  }
}
