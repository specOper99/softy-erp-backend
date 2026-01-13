import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PII, SanitizeHtml } from '../../../common/decorators';
import { ContractType } from '../enums/contract-type.enum';

export class CreateProfileDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

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

export class UpdateProfileDto {
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

  @ApiPropertyOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  baseSalary?: number;

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

export class ProfileResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiPropertyOptional()
  firstName: string;

  @ApiPropertyOptional()
  lastName: string;

  @ApiPropertyOptional()
  jobTitle: string;

  @ApiProperty()
  baseSalary: number;

  @ApiPropertyOptional()
  hireDate: Date | null;

  @ApiPropertyOptional()
  bankAccount: string;

  @ApiPropertyOptional()
  phone: string;

  @ApiPropertyOptional()
  emergencyContactName: string;

  @ApiPropertyOptional()
  emergencyContactPhone: string;

  @ApiPropertyOptional()
  address: string;

  @ApiPropertyOptional()
  city: string;

  @ApiPropertyOptional()
  country: string;

  @ApiPropertyOptional()
  department: string;

  @ApiPropertyOptional()
  team: string;

  @ApiProperty({ enum: ContractType })
  contractType: ContractType;
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
