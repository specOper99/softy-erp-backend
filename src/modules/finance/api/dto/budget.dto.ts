import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

/**
 * Regular expression for YYYY-MM period format.
 * Matches: 2024-01, 2025-12, etc.
 * Rejects: 2024-1, 2024-13, 24-01, etc.
 */
export const PERIOD_FORMAT_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export class CreateBudgetDto {
  @ApiProperty({ example: 'Photography' })
  @IsString()
  department: string;

  @ApiProperty({ example: 5000.0 })
  @IsNumber()
  @Min(0.01, { message: 'Budget amount must be at least $0.01' })
  budgetAmount: number;

  @ApiProperty({
    example: '2024-01',
    description: 'Budget period in YYYY-MM format',
    pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
  })
  @IsString()
  @Matches(PERIOD_FORMAT_REGEX, {
    message: 'Period must be in YYYY-MM format (e.g., 2024-01, 2025-12)',
  })
  period: string;

  @ApiProperty({ example: '2024-01-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2024-01-31' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class BudgetResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  department: string;

  @ApiProperty()
  budgetAmount: number;

  @ApiProperty()
  period: string;

  @ApiProperty()
  startDate: Date;

  @ApiProperty()
  endDate: Date;

  @ApiProperty()
  actualSpent: number;

  @ApiProperty()
  variance: number;

  @ApiProperty()
  utilizationPercentage: number;
}

/**
 * Query DTO for budget report endpoint.
 * Validates period format before processing.
 */
export class BudgetReportQueryDto {
  @ApiProperty({
    example: '2024-01',
    description: 'Budget period in YYYY-MM format',
    pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
  })
  @IsString()
  @Matches(PERIOD_FORMAT_REGEX, {
    message: 'Period must be in YYYY-MM format (e.g., 2024-01, 2025-12)',
  })
  period: string;
}
