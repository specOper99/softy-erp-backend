import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Swagger-documented shape of a single active session returned by GET /auth/sessions.
 * Mirrors the SessionInfo interface defined on RefreshToken.toSessionInfo().
 */
export class SessionInfoDto {
  @ApiProperty({ description: 'Session (refresh token) unique identifier', format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'When the session was created', format: 'date-time' })
  createdAt: Date;

  @ApiPropertyOptional({ description: 'When the session was last used', format: 'date-time' })
  lastUsedAt: Date | null;

  @ApiPropertyOptional({ description: 'IP address that created or last used this session' })
  ipAddress: string | null;

  @ApiPropertyOptional({ description: 'User-Agent string of the client' })
  userAgent: string | null;

  @ApiPropertyOptional({ description: 'Friendly device name derived from the User-Agent' })
  deviceName: string | null;

  @ApiPropertyOptional({ description: 'Approximate geographic location of the session' })
  location: string | null;

  @ApiProperty({ description: 'True if the IP address changed since the session was created' })
  ipChanged: boolean;

  @ApiProperty({ description: 'True if the session has expired' })
  isExpired: boolean;
}
