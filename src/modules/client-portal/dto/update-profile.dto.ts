import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsPhoneNumber, IsString } from 'class-validator';

export class UpdateClientProfileDto {
  @ApiProperty({ description: 'Client name', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ description: 'Client phone', required: false })
  @IsPhoneNumber(undefined, { message: 'Invalid phone number' })
  @IsOptional()
  phone?: string;

  @ApiProperty({ description: 'Email notification preference', required: false })
  @IsBoolean()
  @IsOptional()
  emailNotifications?: boolean;

  @ApiProperty({ description: 'In-app notification preference', required: false })
  @IsBoolean()
  @IsOptional()
  inAppNotifications?: boolean;
}
