import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { PII, SanitizeHtml } from '../../../common/decorators';
import { PaginationMetaDto } from '../../../common/dto/paginated-response.dto';
import { Role } from '../../users/enums/role.enum';
import { PayrollRun } from '../entities/payroll-run.entity';
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

export class ProfilePaginatedResponseDto {
  @ApiProperty({ type: [ProfileResponseDto] })
  data: ProfileResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class ProfileCursorResponseDto {
  @ApiProperty({ type: [ProfileResponseDto] })
  data: ProfileResponseDto[];

  @ApiProperty({ nullable: true, type: String })
  nextCursor: string | null;
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

export class PayrollRunCursorResponseDto {
  @ApiProperty({ type: () => [PayrollRun] })
  data: PayrollRun[];

  @ApiProperty({ nullable: true, type: String })
  nextCursor: string | null;
}

export class CreateStaffUserDto {
  @ApiProperty({ example: 'staff@studio.example' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongPassw0rd!' })
  @IsString()
  password: string;

  @ApiPropertyOptional({
    enum: Role,
    description: 'Allowed roles for studio staff creation',
    default: Role.FIELD_STAFF,
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class CreateStaffProfileDto extends OmitType(CreateProfileDto, ['userId'] as const) {}

export class CreateStaffDto {
  @ApiProperty({ type: CreateStaffUserDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CreateStaffUserDto)
  user: CreateStaffUserDto;

  @ApiProperty({ type: CreateStaffProfileDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CreateStaffProfileDto)
  profile: CreateStaffProfileDto;
}

export class CreateStaffResponseDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  profileId: string;
}
