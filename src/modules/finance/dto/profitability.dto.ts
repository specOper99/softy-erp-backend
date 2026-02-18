import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class ProfitabilityQueryDto {
  @ApiProperty({ description: 'Start date for profitability report (ISO8601)', example: '2026-01-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'End date for profitability report (ISO8601)', example: '2026-01-31' })
  @IsDateString()
  endDate: string;
}

export class PackageProfitabilityDto {
  @ApiProperty({ format: 'uuid' })
  packageId: string;

  @ApiProperty({ example: 1500 })
  revenue: number;

  @ApiProperty({ example: 300 })
  commissions: number;

  @ApiProperty({ example: 120 })
  expenses: number;

  @ApiProperty({ example: 1080 })
  netProfit: number;
}
