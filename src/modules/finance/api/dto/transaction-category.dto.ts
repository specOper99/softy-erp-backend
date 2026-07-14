import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { TransactionType } from '../../domain/enums/transaction-type.enum';

export class CreateTransactionCategoryDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  name: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  description?: string;

  @IsEnum(TransactionType)
  @IsOptional()
  @ApiPropertyOptional({ enum: TransactionType })
  applicableType?: TransactionType;

  @IsUUID()
  @IsOptional()
  @ApiPropertyOptional()
  parentId?: string;
}

export class UpdateTransactionCategoryDto extends PartialType(CreateTransactionCategoryDto) {
  @IsOptional()
  @ApiPropertyOptional()
  isActive?: boolean;
}
