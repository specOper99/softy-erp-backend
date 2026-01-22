import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { DepartmentBudget } from '../entities/department-budget.entity';

@Injectable()
export class DepartmentBudgetRepository extends TenantAwareRepository<DepartmentBudget> {
  constructor(
    @InjectRepository(DepartmentBudget)
    repository: Repository<DepartmentBudget>,
  ) {
    super(repository);
  }
}
