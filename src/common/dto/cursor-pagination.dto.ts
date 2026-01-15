import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Cursor-based pagination DTO (recommended).
 *
 * Cursor pagination provides:
 * - Consistent results even when data changes between pages
 * - Better performance on large datasets (no OFFSET scan)
 * - Efficient keyset navigation
 *
 * Use this for all new endpoints. See `PaginationDto` for legacy offset pagination.
 */
export class CursorPaginationDto {
  @ApiPropertyOptional({
    description: 'Cursor string for next page (base64 encoded)',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Number of items to return',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
