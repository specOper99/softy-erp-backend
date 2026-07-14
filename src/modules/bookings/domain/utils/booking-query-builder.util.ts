import type { SelectQueryBuilder } from 'typeorm';
import { BUSINESS_CONSTANTS } from '../../../../common/constants/business.constants';
import { applyIlikeSearch } from '../../../../common/utils/ilike-escape.util';
import type { BookingFilterFieldsDto } from '../../api/dto/booking-filter-fields.dto';
import type { Booking } from '../entities/booking.entity';

export type BookingFilterParams = Pick<
  BookingFilterFieldsDto,
  'search' | 'status' | 'startDate' | 'endDate' | 'packageId' | 'clientId'
> & {
  minPrice?: number;
  maxPrice?: number;
};

export function applyBookingFilters(qb: SelectQueryBuilder<Booking>, filters: BookingFilterParams): void {
  if (filters.search) {
    const trimmed = filters.search.trim();
    applyIlikeSearch(qb, ['client.name', 'client.email', 'booking.notes'], trimmed, {
      minLength: BUSINESS_CONSTANTS.SEARCH.MIN_LENGTH,
      maxLength: BUSINESS_CONSTANTS.SEARCH.MAX_LENGTH,
    });
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

  if (filters.minPrice !== undefined) {
    qb.andWhere('booking.totalPrice >= :minPrice', { minPrice: filters.minPrice });
  }

  if (filters.maxPrice !== undefined) {
    qb.andWhere('booking.totalPrice <= :maxPrice', { maxPrice: filters.maxPrice });
  }
}
