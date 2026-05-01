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
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Currency } from '../enums/currency.enum';
import { TransactionType } from '../enums/transaction-type.enum';
import { allowsNegativeIncomeForRefundOrReversal } from '../utils/transaction-rule.util';

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
    return allowsNegativeIncomeForRefundOrReversal({
      type: dto.type,
      category: dto.category,
      bookingId: dto.bookingId,
    });
  }

  defaultMessage(): string {
    return 'amount can be negative only for INCOME refunds/reversals with bookingId or refund/reversal category';
  }
}

@ValidatorConstraint({ name: 'atMostOneParentId', async: false })
class AtMostOneParentIdConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args?: ValidationArguments): boolean {
    const dto = args?.object as CreateTransactionDto | undefined;
    if (!dto) return true;
    const set = [dto.bookingId, dto.taskId, dto.payoutId].filter(Boolean).length;
    return set <= 1;
  }

  defaultMessage(): string {
    return 'At most one of bookingId, taskId, payoutId may be provided';
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

  // bookingId is the primary / first-validated field for AtMostOneParentIdConstraint.
  // When more than one parent ID is set the validation error is reported on this field.
  // If the field order here ever changes, update defaultMessage() accordingly so error
  // messages stay consistent.
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  @Validate(AtMostOneParentIdConstraint)
  bookingId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  @Validate(AtMostOneParentIdConstraint)
  taskId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  @Validate(AtMostOneParentIdConstraint)
  payoutId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  description?: string;

  @ApiPropertyOptional({ description: 'Payment method used for this transaction', example: 'E_PAYMENT' })
  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'Receipt, external transaction, or manual payment reference' })
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  reference?: string;

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

  @ApiPropertyOptional()
  paymentMethod: string | null;

  @ApiPropertyOptional()
  reference: string | null;

  @ApiProperty({ enum: Currency })
  currency: Currency;

  @ApiProperty()
  exchangeRate: number;

  @ApiProperty()
  transactionDate: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ description: 'ID of the original transaction this row reverses, if any' })
  reversalOfId: string | null;

  @ApiPropertyOptional({ description: 'Timestamp when this transaction was voided' })
  voidedAt: Date | null;

  @ApiPropertyOptional({ description: 'User ID of the admin who voided this transaction' })
  voidedBy: string | null;
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

  @ApiPropertyOptional({ description: 'Filter transactions by booking ID' })
  @IsUUID()
  @IsOptional()
  bookingId?: string;
}

export class TransactionCursorQueryDto extends CursorPaginationDto {
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

  @ApiPropertyOptional({ description: 'Filter transactions by booking ID' })
  @IsUUID()
  @IsOptional()
  bookingId?: string;
}

export class VoidTransactionDto {
  @ApiPropertyOptional({ example: 'Duplicate entry — client paid twice' })
  @IsOptional()
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  reason?: string;
}
