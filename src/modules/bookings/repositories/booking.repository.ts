import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { Booking } from '../entities/booking.entity';

@Injectable()
export class BookingRepository extends TenantAwareRepository<Booking> {
  constructor(
    @InjectRepository(Booking)
    repository: Repository<Booking>,
  ) {
    super(repository);
  }
}
