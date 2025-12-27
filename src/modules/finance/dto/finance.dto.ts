import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ReferenceType, TransactionType } from '../../../common/enums';

// Transaction DTOs
export class CreateTransactionDto {
  @ApiProperty({ enum: TransactionType })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({ example: 1500.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ example: 'Booking Payment' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  referenceId?: string;

  @ApiPropertyOptional({ enum: ReferenceType })
  @IsEnum(ReferenceType)
  @IsOptional()
  referenceType?: ReferenceType;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty()
  @IsDateString()
  transactionDate: string;
}

export class TransactionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: TransactionType })
  type: TransactionType;

  @ApiProperty()
  amount: number;

  @ApiPropertyOptional()
  category: string;

  @ApiPropertyOptional()
  referenceId: string | null;

  @ApiPropertyOptional({ enum: ReferenceType })
  referenceType: ReferenceType | null;

  @ApiPropertyOptional()
  description: string;

  @ApiProperty()
  transactionDate: Date;

  @ApiProperty()
  createdAt: Date;
}

// Wallet DTOs
export class WalletResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  pendingBalance: number;

  @ApiProperty()
  payableBalance: number;

  @ApiProperty()
  updatedAt: Date;
}

export class TransactionFilterDto {
  @ApiPropertyOptional({ enum: TransactionType })
  @IsEnum(TransactionType)
  @IsOptional()
  type?: TransactionType;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  endDate?: string;
}
