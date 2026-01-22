import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { EmployeeWallet } from '../entities/employee-wallet.entity';

@Injectable()
export class WalletRepository extends TenantAwareRepository<EmployeeWallet> {
  constructor(
    @InjectRepository(EmployeeWallet)
    repository: Repository<EmployeeWallet>,
  ) {
    super(repository);
  }
}
