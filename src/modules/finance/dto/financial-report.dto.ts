import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';

export enum ReportGranularity {
  DAY = 'day',
  MONTH = 'month',
  YEAR = 'year',
}

export class FinancialReportFilterDto {
  @ApiProperty({
    description: 'Start date for the report (ISO8601)',
    example: '2023-01-01',
  })
  @IsISO8601()
  startDate: string;

  @ApiProperty({
    description: 'End date for the report (ISO8601)',
    example: '2023-12-31',
  })
  @IsISO8601()
  endDate: string;

  @ApiProperty({
    enum: ReportGranularity,
    required: false,
    default: ReportGranularity.MONTH,
  })
  @IsOptional()
  @IsEnum(ReportGranularity)
  granularity?: ReportGranularity = ReportGranularity.MONTH;
}
