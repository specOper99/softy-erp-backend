import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Email verification token from email',
    example: 'abc123def456...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
