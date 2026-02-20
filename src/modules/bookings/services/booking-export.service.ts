import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { BUSINESS_CONSTANTS } from '../../../common/constants/business.constants';
import { ExportService } from '../../../common/services/export.service';
import { BookingExportFilterDto } from '../dto/booking-export-filter.dto';
import { BookingRepository } from '../repositories/booking.repository';
import type { BookingExportRow, ClientCsvRow } from '../types/export.types';
import { ClientsService } from './clients.service';

@Injectable()
export class BookingExportService {
  private readonly logger = new Logger(BookingExportService.name);

  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly clientsService: ClientsService,
    private readonly exportService: ExportService,
  ) {}

  async exportBookingsToCSV(res: Response, filters?: BookingExportFilterDto): Promise<void> {
    try {
      const qb = this.bookingRepository
        .createQueryBuilder('booking')
        .leftJoinAndSelect('booking.client', 'client')
        .leftJoinAndSelect('booking.servicePackage', 'servicePackage');

      // Apply optional filters
      if (filters) {
        if (filters.search) {
          const trimmed = filters.search.trim();
          if (trimmed.length >= BUSINESS_CONSTANTS.SEARCH.MIN_LENGTH) {
            const sanitized = trimmed.slice(0, BUSINESS_CONSTANTS.SEARCH.MAX_LENGTH).replace(/[%_]/g, '');
            if (sanitized.length >= BUSINESS_CONSTANTS.SEARCH.MIN_LENGTH) {
              qb.andWhere('(client.name ILIKE :search OR client.email ILIKE :search OR booking.notes ILIKE :search)', {
                search: `%${sanitized}%`,
              });
            }
          }
        }

        if (filters.status && filters.status.length > 0) {
          const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
          qb.andWhere('booking.status IN (:...statuses)', { statuses });
        }

        if (filters.startDate) {
          qb.andWhere('booking.eventDate >= :startDate', { startDate: filters.startDate });
        }

        if (filters.endDate) {
          qb.andWhere('booking.eventDate <= :endDate', { endDate: filters.endDate });
        }

        if (filters.packageId) {
          qb.andWhere('booking.packageId = :packageId', { packageId: filters.packageId });
        }

        if (filters.clientId) {
          qb.andWhere('booking.clientId = :clientId', { clientId: filters.clientId });
        }
      }

      qb.orderBy('booking.createdAt', 'DESC');

      const queryStream = await qb.stream();

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

      await this.exportService.streamFromStream(
        res,
        queryStream,
        `bookings-export-${new Date().toISOString().split('T')[0]}.csv`,
        fields,
        transformFn,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to export bookings CSV: ${message}`);
      throw new InternalServerErrorException('bookings.export_failed');
    }
  }

  async exportClientsToCSV(res: Response): Promise<void> {
    const queryStream = await this.clientsService.getClientExportStream();

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

    await this.exportService.streamFromStream(
      res,
      queryStream,
      `clients-export-${new Date().toISOString().split('T')[0]}.csv`,
      fields,
      transformFn,
    );
  }
}
