import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EnableMfaDto {
  @ApiProperty({ example: '123456', description: 'The TOTP code from the app' })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  code: string;
}

export class VerifyMfaDto {
  @ApiProperty({ example: '123456', description: 'The TOTP code from the app' })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  code: string;
}

export class MfaResponseDto {
  @ApiProperty()
  secret: string;

  @ApiProperty()
  qrCodeUrl: string;
}
