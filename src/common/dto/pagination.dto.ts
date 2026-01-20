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
    // PR-D: Handle page-based pagination more robustly
    // If page is provided, use it with limit (or fall back to take/default)
    // This ensures (page, limit) combinations work correctly
    if (this.page !== undefined) {
      const page = Number.isFinite(this.page) ? this.page : 1;
      let effectiveLimit = this.limit ?? this.take ?? 20;
      effectiveLimit = Number.isFinite(effectiveLimit) ? effectiveLimit : 20;
      return Math.max(0, (page - 1) * effectiveLimit);
    }
    // Fall back to offset-based pagination
    return this.skip && Number.isFinite(this.skip) ? this.skip : 0;
  }

  getTake(): number {
    // PR-D: Ensure we never return NaN; always provide a valid number
    // Prefer explicit limit over take, fall back to default 20
    let takeValue = this.limit ?? this.take ?? 20;
    takeValue = Number.isFinite(takeValue) ? takeValue : 20;
    // Ensure we return a valid number (defend against type coercion edge cases)
    return Math.max(1, Math.min(100, takeValue));
  }
}
