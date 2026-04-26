import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

/**
 * Describes the client portion of the intake wizard.
 *
 * The caller must provide EITHER an existing `clientId` (to select an
 * existing client) OR a `name` (to create a new one). Both fields are
 * optional at the DTO level; the service enforces the mutual-exclusion
 * rule at runtime so that exactly one mode is active.
 */
export class BookingIntakeClientDto {
  /** ID of an existing client. Mutually exclusive with `name`. */
  @ApiPropertyOptional({ description: 'Existing client UUID. Provide this OR name to create a new client.' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  /** Full name for a new client. Required when `clientId` is absent. */
  @ApiPropertyOptional({ description: 'Full name for a new client.' })
  @ValidateIf((o: BookingIntakeClientDto) => !o.clientId)
  @IsNotEmpty()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientNotes?: string;
}

/**
 * Optional deposit to record immediately upon booking creation.
 */
export class BookingIntakeDepositDto {
  @ApiProperty({ description: 'Deposit amount (must be > 0)', example: 150.0 })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ description: 'Way of receiving money', enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ description: 'Payment reference or transaction ID' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ description: 'Date/time the deposit was received. Defaults to now.' })
  @IsOptional()
  @IsDateString()
  transactionDate?: string;
}

/**
 * Root DTO for the booking intake wizard endpoint.
 *
 * Combines client selection/creation, booking details, and an optional
 * deposit into a single atomic request so that all writes succeed or all
 * roll back together.
 */
export class BookingIntakeDto {
  @ApiProperty({ type: () => BookingIntakeClientDto })
  @ValidateNested()
  @Type(() => BookingIntakeClientDto)
  client: BookingIntakeClientDto;

  // ── Booking fields ───────────────────────────────────────────────────────

  @ApiProperty({ description: 'Service package UUID' })
  @IsUUID()
  packageId: string;

  @ApiProperty({ description: 'ISO 8601 event date/time (UTC)', example: '2026-06-15T14:00:00Z' })
  @IsDateString()
  eventDate: string;

  @ApiPropertyOptional({ description: 'Start time in HH:mm format', example: '14:00' })
  @IsOptional()
  @Matches(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/, { message: 'startTime must be in HH:mm format' })
  startTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Payment receipt method for the booking',
    enum: PaymentMethod,
    example: PaymentMethod.CASH,
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  handoverType?: PaymentMethod;

  @ApiPropertyOptional({ description: 'Tax rate percentage (0–50)', example: 15 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  taxRate?: number;

  @ApiPropertyOptional({ description: 'Deposit percentage (0–100)', example: 25 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  depositPercentage?: number;

  @ApiPropertyOptional({ description: 'Flat discount amount', example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional({
    description: 'Venue/hall cost — recorded as expense on P&L, does not reduce invoice',
    example: 200,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  venueCost?: number;

  @ApiPropertyOptional({ description: 'Google Maps or event location URL' })
  @IsOptional()
  @IsString()
  locationLink?: string;

  @ApiPropertyOptional({ description: 'Processing type UUIDs to attach to this booking', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  processingTypeIds?: string[];

  // ── Optional immediate deposit ───────────────────────────────────────────

  @ApiPropertyOptional({
    type: () => BookingIntakeDepositDto,
    description: 'Optional deposit to record as part of this single transaction.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => BookingIntakeDepositDto)
  deposit?: BookingIntakeDepositDto;
}

/**
 * Response shape returned after a successful intake.
 */
export class BookingIntakeResponseDto {
  @ApiProperty({ description: 'UUID of the client (existing or newly created)' })
  clientId: string;

  @ApiProperty({ description: 'UUID of the newly created booking (DRAFT status)' })
  bookingId: string;

  @ApiPropertyOptional({ description: 'UUID of the deposit transaction, when a deposit was provided' })
  depositTransactionId?: string;
}
