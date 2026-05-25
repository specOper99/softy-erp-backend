import { Injectable } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { AvailabilityCacheOwnerService } from '../../../common/cache/availability-cache-owner.service';
import type { BookingRepository } from '../../bookings/repositories/booking.repository';
import type { ServicePackageRepository } from '../../catalog/repositories/service-package.repository';
import type { Tenant } from '../../tenants/entities/tenant.entity';

export interface TimeSlot {
  start: string;
  end: string;
  booked: number;
  available: boolean;
}

export interface AvailabilityResult {
  available: boolean;
  timeSlots: TimeSlot[];
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly cacheOwner: AvailabilityCacheOwnerService,
    private readonly bookingRepository: BookingRepository,
    private readonly servicePackageRepository: ServicePackageRepository,
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async checkAvailability(_tenantId: string, _packageId: string, _date: string): Promise<AvailabilityResult> {
    return { available: true, timeSlots: [] };
  }
}
