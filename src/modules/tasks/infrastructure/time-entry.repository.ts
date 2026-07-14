import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { TimeEntry } from '../domain/entities/time-entry.entity';

@Injectable()
export class TimeEntryRepository extends TenantAwareRepository<TimeEntry> {
  constructor(
    @InjectRepository(TimeEntry)
    repository: Repository<TimeEntry>,
  ) {
    super(repository);
  }
}
