import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { clampPageLimit, pageToSkip } from './pagination.helpers';

/** Supports offset (`page`/`skip` + `limit`) and cursor (`cursor` + `limit`) pagination. */
export class CombinedPaginationDto {
  @ApiPropertyOptional({ description: 'Cursor string for next page (base64 encoded)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based)', minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Skip number of items', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @ApiPropertyOptional({ description: 'Number of items to return', minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Alias for limit (offset pagination)', minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  getSkip(): number {
    if (this.page !== undefined) return pageToSkip(this.page, this.getTake());
    return Math.max(0, Number.isFinite(this.skip) ? (this.skip ?? 0) : 0);
  }

  getTake(): number {
    return clampPageLimit(this.take ?? this.limit);
  }
}
