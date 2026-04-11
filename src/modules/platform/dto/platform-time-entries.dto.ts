import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { TimeEntryStatus } from '../../tasks/entities/time-entry.entity';

export class PlatformTimeEntryQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by user ID' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by task ID' })
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @ApiPropertyOptional({ enum: TimeEntryStatus })
  @IsOptional()
  @IsEnum(TimeEntryStatus)
  status?: TimeEntryStatus;

  @ApiPropertyOptional({ description: 'Start of date range (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'End of date range (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

export class PlatformTimeEntryUpdateDto {
  @ApiPropertyOptional({ description: 'Notes for this time entry' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Whether this entry is billable' })
  @IsOptional()
  @IsBoolean()
  billable?: boolean;

  @ApiPropertyOptional({ description: 'Entry start time (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startTime?: string;

  @ApiPropertyOptional({ description: 'Entry end time (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endTime?: string;
}
