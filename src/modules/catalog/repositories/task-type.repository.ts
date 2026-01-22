import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { TaskType } from '../entities/task-type.entity';

@Injectable()
export class TaskTypeRepository extends TenantAwareRepository<TaskType> {
  constructor(
    @InjectRepository(TaskType)
    repository: Repository<TaskType>,
  ) {
    super(repository);
  }
}
