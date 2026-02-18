import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ServicePackageSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  description?: string | null;

  @ApiProperty({ example: 120 })
  price: number;

  @ApiProperty({ example: 90 })
  durationMinutes: number;

  @ApiProperty({ example: 2 })
  requiredStaffCount: number;

  @ApiProperty({ example: 'REV-SERVICES' })
  revenueAccountCode: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isTemplate: boolean;

  @ApiPropertyOptional({ nullable: true })
  templateCategory?: string | null;
}

export class PaginationMetaResponseDto {
  @ApiProperty()
  totalItems: number;

  @ApiProperty()
  itemCount: number;

  @ApiProperty()
  itemsPerPage: number;

  @ApiProperty()
  totalPages: number;

  @ApiProperty()
  currentPage: number;
}

export class ServicePackagePaginatedResponseDto {
  @ApiProperty({ type: [ServicePackageSummaryResponseDto] })
  data: ServicePackageSummaryResponseDto[];

  @ApiProperty({ type: PaginationMetaResponseDto })
  meta: PaginationMetaResponseDto;
}

export class ServicePackageCursorResponseDto {
  @ApiProperty({ type: [ServicePackageSummaryResponseDto] })
  data: ServicePackageSummaryResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor: string | null;
}
