import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';
import { SanitizeHtml } from '../../../common/decorators/sanitize-html.decorator';

export class CreatePurchaseInvoiceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  vendorId: string;

  @ApiProperty({ example: 'PI-2026-0001' })
  @IsString()
  @MaxLength(100)
  @SanitizeHtml()
  invoiceNumber: string;

  @ApiProperty({ example: '2026-02-18T00:00:00.000Z' })
  @IsDateString()
  invoiceDate: string;

  @ApiProperty({ example: 250.75 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  totalAmount: number;

  @ApiPropertyOptional({ example: 'Stationery and studio consumables' })
  @IsOptional()
  @IsString()
  @SanitizeHtml()
  notes?: string;
}

export class PurchaseInvoiceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  vendorId: string;

  @ApiProperty()
  invoiceNumber: string;

  @ApiProperty()
  invoiceDate: Date;

  @ApiProperty()
  totalAmount: number;

  @ApiPropertyOptional()
  notes: string | null;

  @ApiProperty()
  transactionId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
