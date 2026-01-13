import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { ExportService } from '../../../common/services/export.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import type { BookingExportRow, ClientCsvRow } from '../types/export.types';
import { Booking } from '../entities/booking.entity';
import { Client } from '../entities/client.entity';

@Injectable()
export class BookingExportService {
  private readonly logger = new Logger(BookingExportService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly exportService: ExportService,
  ) {}

  async exportBookingsToCSV(res: Response): Promise<void> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const queryStream = await this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.client', 'client')
      .leftJoinAndSelect('booking.servicePackage', 'servicePackage')
      .where('booking.tenantId = :tenantId', { tenantId })
      .orderBy('booking.createdAt', 'DESC')
      .stream();

    try {
      const fields = ['id', 'clientName', 'clientEmail', 'package', 'eventDate', 'totalPrice', 'status', 'createdAt'];

      const transformFn = (row: unknown): BookingExportRow => {
        const typedRow = row as {
          booking_id?: string;
          client_name?: string;
          client_email?: string;
          servicePackage_name?: string;
          booking_event_date?: string;
          booking_total_price?: string;
          booking_status?: string;
          booking_created_at?: string;
        };

        return {
          id: typedRow.booking_id ?? 'unknown',
          clientName: typedRow.client_name ?? '',
          clientEmail: typedRow.client_email ?? '',
          package: typedRow.servicePackage_name ?? '',
          eventDate: typedRow.booking_event_date ? new Date(typedRow.booking_event_date).toISOString() : '',
          totalPrice: Number(typedRow.booking_total_price ?? 0),
          status: typedRow.booking_status ?? 'UNKNOWN',
          createdAt: typedRow.booking_created_at ? new Date(typedRow.booking_created_at).toISOString() : '',
        };
      };

      this.exportService.streamFromStream(
        res,
        queryStream,
        `bookings-export-${new Date().toISOString().split('T')[0]}.csv`,
        fields,
        transformFn,
      );
    } finally {
      const streamWithDestroy = queryStream as unknown;
      if (streamWithDestroy && typeof streamWithDestroy === 'object' && 'destroy' in streamWithDestroy) {
        await (streamWithDestroy as { destroy: () => Promise<void> }).destroy();
      }
    }
  }

  async exportClientsToCSV(res: Response): Promise<void> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const queryStream = await this.clientRepository
      .createQueryBuilder('client')
      .leftJoin('client.bookings', 'booking')
      .where('client.tenantId = :tenantId', { tenantId })
      .select(['client.id', 'client.name', 'client.email', 'client.phone', 'client.notes', 'client.createdAt'])
      .addSelect('COUNT(booking.id)', 'bookingCount')
      .groupBy('client.id')
      .orderBy('client.createdAt', 'DESC')
      .stream();

    try {
      const fields = ['id', 'name', 'email', 'phone', 'notes', 'bookingCount', 'createdAt'];

      const transformFn = (row: unknown): ClientCsvRow => {
        const typedRow = row as {
          client_id?: string;
          client_name?: string;
          client_email?: string;
          client_phone?: string;
          client_notes?: string;
          client_createdAt?: string;
          bookingCount?: string | number;
        };

        return {
          id: typedRow.client_id ?? 'unknown',
          name: typedRow.client_name ?? '',
          email: typedRow.client_email ?? '',
          phone: typedRow.client_phone ?? '',
          notes: typedRow.client_notes ?? '',
          bookingCount: Number(typedRow.bookingCount ?? 0),
          createdAt: typedRow.client_createdAt ? new Date(typedRow.client_createdAt) : new Date(),
        };
      };

      this.exportService.streamFromStream(
        res,
        queryStream,
        `clients-export-${new Date().toISOString().split('T')[0]}.csv`,
        fields,
        transformFn,
      );
    } finally {
      const streamWithDestroy = queryStream as unknown;
      if (streamWithDestroy && typeof streamWithDestroy === 'object' && 'destroy' in streamWithDestroy) {
        await (streamWithDestroy as { destroy: () => Promise<void> }).destroy();
      }
    }
  }
}
