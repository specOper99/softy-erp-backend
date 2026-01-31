import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TENANT_REPO_CLIENT } from '../../../common/constants/tenant-repo.tokens';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { Booking } from '../../bookings/entities/booking.entity';
import { Client } from '../../bookings/entities/client.entity';
import { BookingRepository } from '../../bookings/repositories/booking.repository';

@Injectable()
export class ClientPortalService {
  constructor(
    @Inject(TENANT_REPO_CLIENT)
    private readonly clientRepository: TenantAwareRepository<Client>,
    private readonly bookingRepository: BookingRepository,
  ) {}

  async getClientProfile(clientId: string, tenantId: string): Promise<Partial<Client>> {
    const client = await this.clientRepository.findOne({
      where: { id: clientId },
    });

    if (!client || client.tenantId !== tenantId) {
      throw new NotFoundException('Client not found');
    }

    return {
      id: client.id,
      name: client.name,
      email: client.email,
      phone: client.phone,
    };
  }

  async getMyBookings(
    clientId: string,
    _tenantId: string, // Kept for API compatibility; TenantAwareRepository handles scoping
    query: PaginationDto = new PaginationDto(),
  ): Promise<Booking[]> {
    return this.bookingRepository.find({
      where: { clientId },
      relations: ['servicePackage'],
      order: { eventDate: 'DESC' },
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  async getBooking(bookingId: string, clientId: string, _tenantId: string): Promise<Booking> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId, clientId },
      relations: ['servicePackage', 'tasks'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }
}
