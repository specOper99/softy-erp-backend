import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PrivacyRequestType } from '../entities/privacy-request.entity';

export class CreatePrivacyRequestDto {
  @ApiProperty({ enum: PrivacyRequestType, description: 'Type of privacy request (export or deletion)' })
  @IsEnum(PrivacyRequestType)
  type: PrivacyRequestType;

  @ApiPropertyOptional({ description: 'Optional reason for the request' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class PrivacyRequestResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: PrivacyRequestType })
  type: PrivacyRequestType;

  @ApiProperty()
  status: string;

  @ApiProperty()
  requestedAt: Date;

  @ApiPropertyOptional({ nullable: true })
  processedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  completedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  expiresAt: Date | null;

  @ApiPropertyOptional({ nullable: true, description: 'Signed download URL for data export' })
  downloadUrl: string | null;
}

export class CancelPrivacyRequestDto {
  @ApiProperty({ format: 'uuid', description: 'ID of the privacy request to cancel' })
  @IsUUID()
  requestId: string;
}
