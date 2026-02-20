import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { TaskAssignee } from '../entities/task-assignee.entity';

@Injectable()
export class TaskAssigneeRepository extends TenantAwareRepository<TaskAssignee> {
  constructor(
    @InjectRepository(TaskAssignee)
    repository: Repository<TaskAssignee>,
  ) {
    super(repository);
  }
}
