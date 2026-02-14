import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class ClientPortalClientDto {
  @ApiProperty({ example: 'cl_123' })
  id: string;

  @ApiProperty({ example: 'client@erp.soft-y.org' })
  email: string;

  @ApiProperty({ example: 'Client Name' })
  name: string;

  @ApiProperty({ example: 'softy-hq' })
  tenantSlug: string;
}

export class ClientPortalProfileResponseDto {
  @ApiProperty({ example: 'cl_123' })
  id: string;

  @ApiProperty({ example: 'client@erp.soft-y.org' })
  email: string;

  @ApiProperty({ example: 'Client Name' })
  name: string;

  @ApiPropertyOptional({ example: '+9647xxxxxxx' })
  phone?: string;

  @ApiProperty({ example: 'softy-hq' })
  tenantSlug: string;

  @ApiPropertyOptional({ example: 'Softy' })
  company?: string;

  @ApiPropertyOptional({ example: 'Baghdad' })
  location?: string;

  @ApiPropertyOptional({ example: '2026-01-15T09:00:00Z' })
  joinedAt?: Date;
}

export class ClientPortalAuthResponseDto {
  @ApiProperty({ example: 'client_jwt_or_token' })
  accessToken: string;

  @ApiProperty({ example: '2026-02-11T12:00:00Z' })
  expiresAt: Date;

  @ApiProperty({ type: ClientPortalClientDto })
  client: ClientPortalClientDto;
}

export class ClientPortalMessageResponseDto {
  @ApiProperty({ example: 'Operation completed successfully' })
  message: string;
}

export class ClientPortalListingSummaryDto {
  @ApiProperty({ example: 'lst_1001' })
  id: string;

  @ApiProperty({ example: 'Executive Office Cleaning' })
  title: string;

  @ApiProperty({ example: 'Premium cleaning package for executive offices.' })
  shortDescription: string;

  @ApiPropertyOptional({ example: 'Baghdad' })
  location?: string;

  @ApiProperty({ example: 120 })
  priceFrom: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: 4.8 })
  rating: number;

  @ApiProperty({ example: 34 })
  reviewCount: number;

  @ApiPropertyOptional({ example: 'https://example.com/listing.jpg' })
  imageUrl?: string;

  @ApiProperty({ type: [String], example: ['Premium', 'Office'] })
  tags: string[];
}

export class ClientPortalListingsResponseDto {
  @ApiProperty({ type: [ClientPortalListingSummaryDto] })
  items: ClientPortalListingSummaryDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 6 })
  pageSize: number;
}

export class ClientPortalListingDetailsResponseDto extends ClientPortalListingSummaryDto {
  @ApiProperty({ example: 'Full description...' })
  description: string;

  @ApiProperty({ type: [String], example: ['https://example.com/a.jpg', 'https://example.com/b.jpg'] })
  gallery: string[];

  @ApiProperty({ type: [String], example: ['Dedicated supervisor', 'Eco-friendly supplies'] })
  highlights: string[];

  @ApiPropertyOptional({ example: '3-4 hours' })
  duration?: string;

  @ApiProperty({ type: [String], example: ['Full desk sanitation', 'Glass & window cleaning'] })
  includes: string[];
}

export class ClientPortalAvailabilitySlotDto {
  @ApiProperty({ example: 'slot_1' })
  id: string;

  @ApiProperty({ example: '10:00' })
  time: string;

  @ApiProperty({ example: true })
  available: boolean;

  @ApiProperty({ example: 4 })
  capacity: number;

  @ApiProperty({ example: 2 })
  remaining: number;
}

export class ClientPortalAvailabilityDayDto {
  @ApiProperty({ example: '2026-02-20' })
  date: string;

  @ApiProperty({ type: [ClientPortalAvailabilitySlotDto] })
  slots: ClientPortalAvailabilitySlotDto[];
}

export class ClientPortalAvailabilityResponseDto {
  @ApiProperty({ example: 'lst_1001' })
  listingId: string;

  @ApiProperty({ type: [ClientPortalAvailabilityDayDto] })
  days: ClientPortalAvailabilityDayDto[];
}

export class ClientPortalBookingsListItemDto {
  @ApiProperty({ example: 'bk_1001' })
  id: string;

  @ApiProperty({ example: 'BK-2026-1001' })
  reference: string;

  @ApiProperty({ example: 'lst_1002' })
  listingId: string;

  @ApiProperty({ example: 'Event Venue Setup' })
  listingTitle: string;

  @ApiPropertyOptional({ example: 'Erbil' })
  location?: string;

  @ApiProperty({ example: '2026-02-20' })
  date: string;

  @ApiProperty({ example: '11:00' })
  time: string;

  @ApiProperty({ example: 6 })
  guests: number;

  @ApiProperty({ example: 'upcoming' })
  status: string;

  @ApiProperty({ example: '2026-02-11T12:00:00Z' })
  createdAt: Date;
}

export class ClientPortalBookingsListResponseDto {
  @ApiProperty({ type: [ClientPortalBookingsListItemDto] })
  items: ClientPortalBookingsListItemDto[];

  @ApiProperty({ example: 12 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  pageSize: number;
}

export class ClientPortalBookingTimelineDto {
  @ApiProperty({ example: 'created' })
  type: string;

  @ApiProperty({ example: '2026-02-11T12:00:00Z' })
  at: Date;
}

export class ClientPortalBookingDetailsResponseDto extends ClientPortalBookingsListItemDto {
  @ApiPropertyOptional({ example: 'Client Name' })
  contactName?: string;

  @ApiPropertyOptional({ example: 'client@erp.soft-y.org' })
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+9647xxxxxxx' })
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'Please prepare parking.' })
  notes?: string;

  @ApiProperty({ type: [ClientPortalBookingTimelineDto] })
  timeline: ClientPortalBookingTimelineDto[];
}

export class ClientPortalCreateBookingRequestDto {
  @ApiProperty({ example: 'lst_1001' })
  @IsUUID()
  listingId: string;

  @ApiProperty({ example: '2026-02-20' })
  @IsString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ example: '10:00' })
  @Matches(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/)
  time: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  guests: number;

  @ApiProperty({ example: 'Client Name' })
  @IsString()
  @IsNotEmpty()
  contactName: string;

  @ApiProperty({ example: 'client@erp.soft-y.org' })
  @IsEmail()
  contactEmail: string;

  @ApiPropertyOptional({ example: '+9647xxxxxxx' })
  @IsString()
  @IsOptional()
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'Please prepare parking.' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class ClientPortalCreateBookingResponseDto {
  @ApiProperty({ example: 'bk_123' })
  id: string;

  @ApiProperty({ example: 'BK-2026-0001' })
  reference: string;

  @ApiProperty({ example: 'confirmed' })
  status: string;

  @ApiProperty({ example: '2026-02-20T10:00:00Z' })
  scheduledAt: Date;
}

export class ClientPortalCancelBookingRequestDto {
  @ApiPropertyOptional({ example: 'Client requested cancellation' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class ClientPortalCancelBookingResponseDto {
  @ApiProperty({ example: 'bk_1001' })
  id: string;

  @ApiProperty({ example: 'cancelled' })
  status: string;

  @ApiProperty({ example: 'BK-2026-1001' })
  reference: string;

  @ApiProperty({ example: '2026-02-11T12:10:00Z' })
  cancelledAt: Date;
}

export class ClientPortalNotificationPreferencesDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  marketing: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  reminders: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  updates: boolean;
}

export class ClientPortalListingsQueryDto {
  @ApiPropertyOptional({ example: 'office' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'Baghdad' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'Premium' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  minPrice?: number;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsInt()
  maxPrice?: number;

  @ApiPropertyOptional({ example: 'priceAsc' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ example: 'softy-hq' })
  @IsOptional()
  @IsString()
  tenantSlug?: string;
}

export class ClientPortalAvailabilityQueryDto {
  @ApiPropertyOptional({ example: '2026-02-20' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-02-24' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ example: 'softy-hq' })
  @IsOptional()
  @IsString()
  tenantSlug?: string;
}
