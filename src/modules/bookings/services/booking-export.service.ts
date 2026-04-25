import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { BUSINESS_CONSTANTS } from '../../../common/constants/business.constants';
import { ExportService } from '../../../common/services/export.service';
import { Transaction } from '../../finance/entities/transaction.entity';
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
        .leftJoin('booking.client', 'client')
        .leftJoin('booking.servicePackage', 'servicePackage')
        .leftJoin('booking.processingTypes', 'processingTypes')
        .leftJoin(
          Transaction,
          'paymentTx',
          'paymentTx.bookingId = booking.id AND paymentTx.tenantId = booking.tenantId AND paymentTx.amount > 0',
        )
        .select([
          'booking.id',
          'booking.eventDate',
          'booking.notes',
          'booking.totalPrice',
          'booking.amountPaid',
          'booking.venueCost',
          'booking.paymentStatus',
          'booking.handoverType',
          'booking.status',
          'booking.createdAt',
          'client.name',
          'client.email',
          'client.phone',
          'servicePackage.name',
        ])
        .addSelect("STRING_AGG(DISTINCT processingTypes.name, ', ')", 'processing_types')
        .addSelect('MIN(paymentTx.transactionDate)', 'first_payment_date')
        .groupBy('booking.id')
        .addGroupBy('booking.eventDate')
        .addGroupBy('booking.notes')
        .addGroupBy('booking.totalPrice')
        .addGroupBy('booking.amountPaid')
        .addGroupBy('booking.venueCost')
        .addGroupBy('booking.paymentStatus')
        .addGroupBy('booking.handoverType')
        .addGroupBy('booking.status')
        .addGroupBy('booking.createdAt')
        .addGroupBy('client.id')
        .addGroupBy('client.name')
        .addGroupBy('client.email')
        .addGroupBy('client.phone')
        .addGroupBy('servicePackage.id')
        .addGroupBy('servicePackage.name');

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

      const fields = [
        'id',
        'eventDate',
        'eventDay',
        'clientName',
        'clientEmail',
        'clientPhone',
        'package',
        'notes',
        'totalPrice',
        'processingTypes',
        'firstPaymentDate',
        'amountPaid',
        'handoverType',
        'venueCost',
        'remainingBalance',
        'remainingBalanceMinusVenueCost',
        'totalDueWithVenueCost',
        'paymentStatus',
        'status',
        'createdAt',
      ];

      const transformFn = (row: unknown): BookingExportRow => {
        const typedRow = row as {
          booking_id?: string;
          client_name?: string;
          client_email?: string;
          client_phone?: string;
          servicePackage_name?: string;
          booking_event_date?: string;
          booking_notes?: string;
          booking_total_price?: string;
          booking_amount_paid?: string;
          booking_venue_cost?: string;
          booking_payment_status?: string;
          booking_handover_type?: string;
          booking_status?: string;
          booking_created_at?: string;
          processing_types?: string;
          first_payment_date?: string;
        };
        const eventDate = typedRow.booking_event_date ? new Date(typedRow.booking_event_date) : null;
        const totalPrice = Number(typedRow.booking_total_price ?? 0);
        const amountPaid = Number(typedRow.booking_amount_paid ?? 0);
        const venueCost = Number(typedRow.booking_venue_cost ?? 0);
        const remainingBalance = Math.max(0, totalPrice - amountPaid);
        const remainingBalanceMinusVenueCost = Math.max(0, remainingBalance - venueCost);

        return {
          id: typedRow.booking_id ?? 'unknown',
          eventDate: eventDate ? eventDate.toISOString() : '',
          eventDay: eventDate ? new Intl.DateTimeFormat('ar-IQ', { weekday: 'long' }).format(eventDate) : '',
          clientName: typedRow.client_name ?? '',
          clientEmail: typedRow.client_email ?? '',
          clientPhone: typedRow.client_phone ?? '',
          package: typedRow.servicePackage_name ?? '',
          notes: typedRow.booking_notes ?? '',
          totalPrice,
          processingTypes: typedRow.processing_types ?? '',
          firstPaymentDate: typedRow.first_payment_date ? new Date(typedRow.first_payment_date).toISOString() : '',
          amountPaid,
          handoverType: typedRow.booking_handover_type ?? '',
          venueCost,
          remainingBalance,
          remainingBalanceMinusVenueCost,
          totalDueWithVenueCost: remainingBalance + venueCost,
          paymentStatus: typedRow.booking_payment_status ?? 'UNPAID',
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
