import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { clampPageLimit, pageToSkip } from './pagination.helpers';

/** @deprecated Prefer {@link CursorPaginationDto} for new endpoints. */
export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  getSkip(): number {
    if (this.page !== undefined) return pageToSkip(this.page, this.limit ?? this.take);
    return Number.isFinite(this.skip) ? Math.max(0, this.skip!) : 0;
  }

  getTake(): number {
    return clampPageLimit(this.limit ?? this.take);
  }
}
