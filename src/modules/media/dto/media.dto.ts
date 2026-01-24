import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, IsUrl, Max, Min } from 'class-validator';

export class CreateAttachmentDto {
  @ApiPropertyOptional({ description: 'ID of the booking to attach to' })
  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @ApiPropertyOptional({ description: 'ID of the task to attach to' })
  @IsOptional()
  @IsUUID()
  taskId?: string;
}

export class PresignedUploadDto {
  @ApiProperty({ description: 'Original filename' })
  @IsString()
  filename: string;

  @ApiProperty({ description: 'MIME type of the file' })
  @IsString()
  mimeType: string;

  @ApiPropertyOptional({ description: 'ID of the booking to attach to' })
  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @ApiPropertyOptional({ description: 'ID of the task to attach to' })
  @IsOptional()
  @IsUUID()
  taskId?: string;
}

export class ConfirmUploadDto {
  @ApiProperty({ description: 'Client-reported size in bytes (validated against storage metadata on confirm)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  size: number;
}

export class LinkAttachmentDto {
  @ApiProperty({ description: 'External URL to link as attachment' })
  @IsUrl({ require_protocol: true })
  url: string;

  @ApiPropertyOptional({ description: 'Display name of the file' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'MIME type of the file' })
  @IsString()
  @IsOptional()
  mimeType?: string;

  @ApiPropertyOptional({ description: 'Size of the file in bytes' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  size?: number;

  @ApiPropertyOptional({ description: 'Associated booking ID' })
  @IsUUID()
  @IsOptional()
  bookingId?: string;

  @ApiPropertyOptional({ description: 'Associated task ID' })
  @IsUUID()
  @IsOptional()
  taskId?: string;
}
