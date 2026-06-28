import { ApiProperty, ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
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

@ValidatorConstraint({ name: 'negativeAmountRefundOrReversal', async: false })
class NegativeAmountRefundOrReversalConstraint implements ValidatorConstraintInterface {
  validate(amount: number, args?: ValidationArguments): boolean {
    if (amount >= 0) return true;
    const dto = args?.object as CreateTransactionDto | undefined;
    return dto
      ? allowsNegativeIncomeForRefundOrReversal({ type: dto.type, category: dto.category, bookingId: dto.bookingId })
      : false;
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
    return [dto.bookingId, dto.taskId, dto.payoutId].filter(Boolean).length <= 1;
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

  /** Primary field for AtMostOneParentIdConstraint error reporting. */
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

  @ApiPropertyOptional({ example: 'E_PAYMENT' })
  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  reference?: string;

  @ApiProperty({ enum: Currency, default: Currency.IQD })
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

  @ApiPropertyOptional()
  reversalOfId: string | null;

  @ApiPropertyOptional()
  voidedAt: Date | null;

  @ApiPropertyOptional()
  voidedBy: string | null;
}

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

class TransactionQueryFields {
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

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  bookingId?: string;
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

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  bookingId?: string;
}

export class TransactionCursorQueryDto extends IntersectionType(CursorPaginationDto, TransactionQueryFields) {}

export class VoidTransactionDto {
  @ApiPropertyOptional({ example: 'Duplicate entry — client paid twice' })
  @IsOptional()
  @IsString()
  @SanitizeHtml()
  reason?: string;
}
