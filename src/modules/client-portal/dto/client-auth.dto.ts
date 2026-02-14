import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RequestMagicLinkDto {
  @ApiProperty({ example: 'client@erp.soft-y.org' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'softy-hq', description: 'Tenant slug for the client account' })
  @IsNotEmpty()
  @IsString()
  tenantSlug: string;
}

export class VerifyMagicLinkDto {
  @ApiProperty({ description: 'The magic link token' })
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'softy-hq', description: 'Tenant slug for the client account' })
  @IsNotEmpty()
  @IsString()
  tenantSlug: string;
}

export class ClientTokenResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty()
  client: {
    id: string;
    name: string;
    email: string;
    tenantSlug?: string;
  };
}
