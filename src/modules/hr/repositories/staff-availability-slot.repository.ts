import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { StaffAvailabilitySlot } from '../entities/staff-availability-slot.entity';

@Injectable()
export class StaffAvailabilitySlotRepository extends TenantAwareRepository<StaffAvailabilitySlot> {
  constructor(
    @InjectRepository(StaffAvailabilitySlot)
    repository: Repository<StaffAvailabilitySlot>,
  ) {
    super(repository);
  }
}
