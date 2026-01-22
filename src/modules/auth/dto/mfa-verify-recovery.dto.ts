import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class MfaVerifyRecoveryDto {
  @ApiProperty({
    description: 'Temporary MFA token received from login endpoint',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsNotEmpty()
  tempToken: string;

  @ApiProperty({
    description: '8-character recovery code (uppercase hex characters)',
    example: 'A1B2C3D4',
    minLength: 8,
    maxLength: 8,
  })
  @IsString()
  @IsNotEmpty()
  @Length(8, 8)
  code: string;
}
