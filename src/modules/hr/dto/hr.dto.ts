import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

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
  bankAccount?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;
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
  bankAccount?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;
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
