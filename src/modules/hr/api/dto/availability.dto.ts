import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class AvailabilityQueryDto {
  @ApiProperty({ example: '2026-03-01T00:00:00.000Z' })
  @IsDateString()
  start: string;

  @ApiProperty({ example: '2026-03-31T23:59:59.999Z' })
  @IsDateString()
  end: string;

  @ApiPropertyOptional({ example: 'e4f9d138-ef03-4b9e-a6ed-21ce5d5e6da7' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class AvailabilityWindowDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  bookingId: string;

  @ApiProperty()
  packageId: string;

  @ApiProperty({ type: String, format: 'date-time' })
  start: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  end: Date;
}
