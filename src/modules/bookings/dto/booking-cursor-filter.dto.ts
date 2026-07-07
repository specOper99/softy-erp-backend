import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { WithBookingFilterFields } from './booking-filter-fields.dto';

/**
 * Cursor-based pagination DTO with booking filter fields.
 *
 * Mirrors the filter fields from {@link BookingFilterDto} but extends
 * cursor pagination instead of offset pagination.
 */
export class BookingCursorFilterDto extends WithBookingFilterFields(CursorPaginationDto) {}
