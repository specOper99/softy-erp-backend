import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { SanitizeHtml } from '../../../common/decorators/sanitize-html.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Currency } from '../enums/currency.enum';
import { TransactionType } from '../enums/transaction-type.enum';

// Transaction DTOs
@ValidatorConstraint({ name: 'negativeAmountRefundOrReversal', async: false })
class NegativeAmountRefundOrReversalConstraint implements ValidatorConstraintInterface {
  validate(amount: number, args?: ValidationArguments): boolean {
    if (amount >= 0) {
      return true;
    }

    const dto = args?.object as CreateTransactionDto | undefined;
    if (!dto) {
      return false;
    }
    if (dto.type !== TransactionType.INCOME) {
      return false;
    }

    const hasBookingId = typeof dto.bookingId === 'string' && dto.bookingId.trim().length > 0;
    const normalizedCategory = typeof dto.category === 'string' ? dto.category.toLowerCase() : '';
    const hasRefundOrReversalMarker = normalizedCategory.includes('refund') || normalizedCategory.includes('reversal');

    return hasBookingId || hasRefundOrReversalMarker;
  }

  defaultMessage(): string {
    return 'amount can be negative only for INCOME refunds/reversals with bookingId or refund/reversal category';
  }
}

export class CreateTransactionDto {
  @ApiProperty({ enum: TransactionType })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({ example: 1500.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Validate(NegativeAmountRefundOrReversalConstraint)
  amount: number;

  @ApiPropertyOptional({ example: 'Booking Payment' })
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  category?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  department?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  bookingId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  taskId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  payoutId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  description?: string;

  @ApiProperty({ enum: Currency, default: Currency.USD })
  @IsEnum(Currency)
  @IsOptional()
  currency?: Currency;

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
  bookingId: string | null;

  @ApiPropertyOptional()
  taskId: string | null;

  @ApiPropertyOptional()
  payoutId: string | null;

  @ApiPropertyOptional()
  description: string;

  @ApiProperty({ enum: Currency })
  currency: Currency;

  @ApiProperty()
  exchangeRate: number;

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

export class TransactionFilterDto extends PaginationDto {
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
