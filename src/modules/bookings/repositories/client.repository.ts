import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { Client } from '../entities/client.entity';

@Injectable()
export class ClientRepository extends TenantAwareRepository<Client> {
  constructor(
    @InjectRepository(Client)
    repository: Repository<Client>,
  ) {
    super(repository);
  }
}
