import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SessionInfoDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiPropertyOptional({ format: 'date-time' })
  lastUsedAt: Date | null;

  @ApiPropertyOptional()
  ipAddress: string | null;

  @ApiPropertyOptional()
  userAgent: string | null;

  @ApiPropertyOptional()
  deviceName: string | null;

  @ApiPropertyOptional()
  location: string | null;

  @ApiProperty()
  ipChanged: boolean;

  @ApiProperty()
  isExpired: boolean;
}
