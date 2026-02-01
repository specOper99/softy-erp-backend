import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { PayrollRun } from '../entities/payroll-run.entity';

@Injectable()
export class PayrollRunRepository extends TenantAwareRepository<PayrollRun> {
  constructor(
    @InjectRepository(PayrollRun)
    repository: Repository<PayrollRun>,
  ) {
    super(repository);
  }
}
