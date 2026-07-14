import { ApiProperty } from '@nestjs/swagger';

/** Shape returned by GET /auth/me. */
export class CurrentUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'admin@erp.soft-y.org' })
  email: string;

  @ApiProperty({ example: 'ADMIN' })
  role: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isMfaEnabled: boolean;

  @ApiProperty({ format: 'uuid' })
  tenantId: string;

  @ApiProperty()
  tenantSlug: string;
}
