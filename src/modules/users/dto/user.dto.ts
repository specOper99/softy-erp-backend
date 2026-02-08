import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CombinedPaginationDto } from '../../../common/dto/combined-pagination.dto';
import { PII } from '../../../common/decorators';
import { Role } from '../enums/role.enum';

export class CreateUserDto {
  @ApiProperty({ example: 'user@erp.soft-y.org' })
  @IsEmail()
  @PII()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsString()
  @MinLength(6)
  @PII()
  password: string;

  @ApiPropertyOptional({ enum: Role, default: Role.FIELD_STAFF })
  @IsEnum(Role)
  @IsOptional()
  role?: Role;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'user@erp.soft-y.org' })
  @IsEmail()
  @IsOptional()
  @PII()
  email?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  emailVerified?: boolean;
}

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class UserFilterDto extends CombinedPaginationDto {
  @ApiPropertyOptional({
    enum: Role,
    description: 'Filter users by role',
    example: Role.FIELD_STAFF,
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Search in user email',
    example: 'ops@studio.example',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
