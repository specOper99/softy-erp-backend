import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class RequestMagicLinkDto {
  @ApiProperty({ example: 'client@erp.soft-y.org' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class VerifyMagicLinkDto {
  @ApiProperty({ description: 'The magic link token' })
  @IsNotEmpty()
  token: string;
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
  };
}
