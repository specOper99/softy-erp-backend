import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateBudgetDto {
  @ApiProperty({ example: 'Photography' })
  @IsString()
  department: string;

  @ApiProperty({ example: 5000.0 })
  @IsNumber()
  @Min(0)
  budgetAmount: number;

  @ApiProperty({ example: '2024-01', description: 'Format YYYY-MM' })
  @IsString()
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
