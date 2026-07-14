import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyRecoveryCodeDto {
  @ApiProperty({
    description: 'MFA recovery code (8 uppercase hex characters)',
    example: 'A1B2C3D4',
    minLength: 8,
    maxLength: 8,
  })
  @IsString()
  @IsNotEmpty()
  @Length(8, 8, { message: 'Recovery code must be exactly 8 characters' })
  code: string;
}
