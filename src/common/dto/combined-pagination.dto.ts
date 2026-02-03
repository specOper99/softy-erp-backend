import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Combined pagination DTO supporting both offset and cursor pagination.
 *
 * This DTO allows endpoints to support both pagination strategies:
 * - Offset pagination (deprecated): Use `page` and `limit` or `skip` and `take`
 * - Cursor pagination (recommended): Use `cursor` and `limit`
 *
 * The service layer determines which strategy to use based on the endpoint.
 */
export class CombinedPaginationDto {
  // Cursor pagination fields
  @ApiPropertyOptional({
    description: 'Cursor string for next page (base64 encoded)',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  // Offset pagination fields
  @ApiPropertyOptional({
    description: 'Page number (1-based, for offset pagination)',
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Skip number of items (for offset pagination)',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

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

  @ApiPropertyOptional({
    description: 'Number of items to take (alias for limit, for offset pagination)',
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  getSkip(): number {
    if (this.page !== undefined) {
      const page = Number.isFinite(this.page) ? this.page : 1;
      const effectiveLimit = this.getTake();
      return Math.max(0, (page - 1) * effectiveLimit);
    }
    const skip = Number.isFinite(this.skip) ? (this.skip ?? 0) : 0;
    return Math.max(0, skip);
  }

  getTake(): number {
    const candidate = this.take ?? this.limit ?? 20;
    const normalized = Number.isFinite(candidate) ? candidate : 20;
    return Math.max(1, Math.min(100, normalized));
  }
}
