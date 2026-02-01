import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PlatformLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  mfaCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceName?: string;
}

export class PlatformRevokeAllSessionsDto {
  @IsString()
  @MinLength(10)
  reason: string;
}
