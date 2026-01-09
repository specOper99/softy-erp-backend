import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Currency } from '../enums/currency.enum';
import { TransactionType } from '../enums/transaction-type.enum';
import {
  RecurringFrequency,
  RecurringStatus,
} from '../entities/recurring-transaction.entity';

export class CreateRecurringTransactionDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Name/title of the recurring transaction' })
  name: string;

  @IsEnum(TransactionType)
  @ApiProperty({ enum: TransactionType })
  type: TransactionType;

  @IsNumber()
  @IsPositive()
  @ApiProperty({ description: 'Transaction amount' })
  amount: number;

  @IsEnum(Currency)
  @IsOptional()
  @ApiPropertyOptional({ enum: Currency, default: Currency.USD })
  currency?: Currency;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Transaction category' })
  category?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Department' })
  department?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Description' })
  description?: string;

  @IsEnum(RecurringFrequency)
  @ApiProperty({ enum: RecurringFrequency })
  frequency: RecurringFrequency;

  @IsNumber()
  @Min(1)
  @Max(365)
  @IsOptional()
  @ApiPropertyOptional({ default: 1, description: 'Interval multiplier' })
  interval?: number;

  @IsDateString()
  @ApiProperty({ description: 'Start date (ISO string)' })
  startDate: string;

  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional({ description: 'End date (ISO string)' })
  endDate?: string;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Max number of occurrences' })
  maxOccurrences?: number;

  @IsNumber()
  @Min(0)
  @Max(30)
  @IsOptional()
  @ApiPropertyOptional({
    default: 0,
    description: 'Days before to send reminder',
  })
  notifyBeforeDays?: number;
}

export class UpdateRecurringTransactionDto extends PartialType(
  CreateRecurringTransactionDto,
) {
  @IsEnum(RecurringStatus)
  @IsOptional()
  @ApiPropertyOptional({ enum: RecurringStatus })
  status?: RecurringStatus;
}
