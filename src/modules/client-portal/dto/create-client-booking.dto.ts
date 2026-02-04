import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateClientBookingDto {
  @ApiProperty({ description: 'Service package ID' })
  @IsUUID()
  @IsNotEmpty()
  packageId: string;

  @ApiProperty({ description: 'Event date in YYYY-MM-DD format', example: '2026-02-15' })
  @IsDateString()
  @IsNotEmpty()
  eventDate: string;

  @ApiProperty({ description: 'Start time in HH:mm format (tenant timezone)', example: '14:30' })
  @Matches(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/, {
    message: 'startTime must be in HH:mm format',
  })
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({ description: 'Additional notes', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
