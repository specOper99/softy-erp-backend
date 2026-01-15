import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Offset-based pagination DTO.
 *
 * @deprecated Prefer {@link CursorPaginationDto} for new endpoints.
 * Offset pagination degrades in performance on large datasets and can
 * produce inconsistent results when data changes between pages.
 *
 * Existing endpoints using this DTO are maintained for backward compatibility.
 */
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
    if (this.page && this.limit) {
      return (this.page - 1) * this.limit;
    }
    return this.skip ?? 0;
  }

  getTake(): number {
    if (this.limit) {
      return this.limit;
    }
    return this.take ?? 20;
  }
}
