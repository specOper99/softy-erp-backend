import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TENANT_REPO_CLIENT } from '../../../common/constants/tenant-repo.tokens';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { Booking } from '../../bookings/entities/booking.entity';
import { Client } from '../../bookings/entities/client.entity';

@Injectable()
export class ClientPortalService {
  constructor(
    @Inject(TENANT_REPO_CLIENT)
    private readonly clientRepository: TenantAwareRepository<Client>,
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
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

  async getMyBookings(clientId: string, tenantId: string): Promise<Booking[]> {
    return this.bookingRepository.find({
      where: { clientId, tenantId },
      relations: ['servicePackage'],
      order: { eventDate: 'DESC' },
    });
  }

  async getBooking(bookingId: string, clientId: string, tenantId: string): Promise<Booking> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId, clientId, tenantId },
      relations: ['servicePackage', 'tasks'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }
}
