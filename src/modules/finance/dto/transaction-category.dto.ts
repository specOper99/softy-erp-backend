import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { TransactionType } from '../enums/transaction-type.enum';

export class CreateTransactionCategoryDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Category name' })
  name: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Category description' })
  description?: string;

  @IsEnum(TransactionType)
  @IsOptional()
  @ApiPropertyOptional({
    enum: TransactionType,
    description: 'If set, category only applies to this transaction type',
  })
  applicableType?: TransactionType;

  @IsUUID()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Parent category ID for hierarchy' })
  parentId?: string;
}

export class UpdateTransactionCategoryDto extends PartialType(
  CreateTransactionCategoryDto,
) {
  @IsOptional()
  @ApiPropertyOptional({ description: 'Whether category is active' })
  isActive?: boolean;
}
