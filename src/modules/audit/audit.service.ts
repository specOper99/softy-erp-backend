import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  async log(
    data: {
      userId?: string;
      action: string;
      entityName: string;
      entityId: string;
      oldValues?: unknown;
      newValues?: unknown;
      notes?: string;
    },
    manager?: EntityManager,
  ) {
    const repo = manager
      ? manager.getRepository(AuditLog)
      : this.auditRepository;

    // Capture tenant context for scoped audit queries
    const tenantId = TenantContextService.getTenantId();

    const entry = repo.create({
      ...data,
      tenantId,
    });
    return repo.save(entry);
  }
}
