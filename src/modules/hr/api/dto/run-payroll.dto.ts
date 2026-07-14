import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Optional period payload for manual payroll runs.
 *
 * When fields are omitted, the backend defaults to the current month/year.
 */
export class RunPayrollDto {
  @ApiPropertyOptional({
    description: 'Target month (1-12). Defaults to current month when omitted.',
    minimum: 1,
    maximum: 12,
    example: 2,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({
    description: 'Target year. Defaults to current year when omitted.',
    minimum: 2020,
    maximum: 2100,
    example: 2026,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;
}
