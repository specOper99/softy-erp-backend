import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PrivacyRequestType } from '../entities/privacy-request.entity';

export class CreatePrivacyRequestDto {
  @IsEnum(PrivacyRequestType)
  type: PrivacyRequestType;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class PrivacyRequestResponseDto {
  id: string;
  type: PrivacyRequestType;
  status: string;
  requestedAt: Date;
  processedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date | null;
  downloadUrl: string | null;
}

export class CancelPrivacyRequestDto {
  @IsUUID()
  requestId: string;
}
