import { IsEmail, IsOptional, IsString } from 'class-validator';

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
