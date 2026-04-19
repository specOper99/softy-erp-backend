import { ApiProperty } from '@nestjs/swagger';

/**
 * Swagger-documented shape returned by GET /auth/me.
 */
export class CurrentUserDto {
  @ApiProperty({ description: 'User unique identifier', format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'User email address', example: 'admin@erp.soft-y.org' })
  email: string;

  @ApiProperty({ description: 'User role within the tenant', example: 'ADMIN' })
  role: string;

  @ApiProperty({ description: 'Whether the account is active' })
  isActive: boolean;

  @ApiProperty({ description: 'Whether TOTP-based MFA is enabled on the account' })
  isMfaEnabled: boolean;
}
