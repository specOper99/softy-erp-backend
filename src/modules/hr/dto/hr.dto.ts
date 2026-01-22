import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PII, SanitizeHtml } from '../../../common/decorators';
import { ContractType } from '../enums/contract-type.enum';

export class BaseProfileDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  jobTitle?: string;

  @ApiProperty({ example: 2000.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseSalary: number;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  hireDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @PII()
  bankAccount?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @PII()
  phone?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @PII()
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @PII()
  emergencyContactPhone?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @PII()
  address?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  country?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  department?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  team?: string;

  @ApiPropertyOptional({ enum: ContractType })
  @IsEnum(ContractType)
  @IsOptional()
  contractType?: ContractType;
}

export class CreateProfileDto extends BaseProfileDto {
  @ApiProperty()
  @IsUUID()
  userId: string;
}

export class UpdateProfileDto extends PartialType(BaseProfileDto) {}

export class ProfileResponseDto extends OmitType(BaseProfileDto, ['hireDate']) {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiPropertyOptional()
  hireDate: Date | null;
}

export class PayrollRunResponseDto {
  @ApiProperty()
  totalEmployees: number;

  @ApiProperty()
  totalPayout: number;

  @ApiProperty()
  transactionIds: string[];

  @ApiProperty()
  processedAt: Date;
}
