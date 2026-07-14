import { BookingFilterFieldsDto } from './booking-filter-fields.dto';

/**
 * Filter DTO for booking CSV export.
 *
 * When no filters are provided the export includes all bookings (current behavior).
 * When filters are provided the exported CSV is scoped to matching rows only.
 */
export class BookingExportFilterDto extends BookingFilterFieldsDto {}
