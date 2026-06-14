import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class MFAVerifyLoginDto {
  @ApiProperty({ description: 'MFA TOTP code from authenticator app' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'MFA code must be exactly 6 digits' })
  code: string;

  @ApiProperty({ description: 'Temporary MFA token from login response' })
  @IsString()
  @IsNotEmpty()
  tempToken: string;
}
