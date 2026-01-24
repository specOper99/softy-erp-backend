import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

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
  deviceId?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class PlatformRevokeAllSessionsDto {
  @IsString()
  @MinLength(10)
  reason: string;
}
