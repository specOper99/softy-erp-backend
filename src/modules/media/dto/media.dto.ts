import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

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
