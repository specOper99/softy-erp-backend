import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateStaffAvailabilitySlotDto {
  @ApiProperty({ format: 'uuid', description: 'Staff member user ID' })
  @IsUUID()
  userId: string;

  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = Sunday, 6 = Saturday' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ example: '09:00', description: 'Start time in HH:mm 24-hour format' })
  @IsString()
  @Matches(TIME_PATTERN, { message: 'startTime must match HH:mm' })
  startTime: string;

  @ApiProperty({ example: '17:00', description: 'End time in HH:mm 24-hour format' })
  @IsString()
  @Matches(TIME_PATTERN, { message: 'endTime must match HH:mm' })
  endTime: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @ApiProperty({ example: '2026-01-01', description: 'Slot is active from this date (inclusive)' })
  @IsDateString()
  effectiveFrom: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Slot expires after this date (optional)' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class UpdateStaffAvailabilitySlotDto extends PartialType(CreateStaffAvailabilitySlotDto) {
  // All fields optional for PATCH semantics; userId excluded from update
  @ApiPropertyOptional({ minimum: 0, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;
}

export class ListStaffAvailabilitySlotsDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by staff member user ID' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
