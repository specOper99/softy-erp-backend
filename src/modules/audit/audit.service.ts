import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
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
      oldValues?: any;
      newValues?: any;
      notes?: string;
    },
    manager?: EntityManager,
  ) {
    const repo = manager
      ? manager.getRepository(AuditLog)
      : this.auditRepository;
    const entry = repo.create(data);
    return repo.save(entry);
  }
}
