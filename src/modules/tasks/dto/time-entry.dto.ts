import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class StartTimeEntryDto {
  @ApiProperty({ description: 'Task ID to track time for' })
  @IsUUID()
  taskId: string;

  @ApiPropertyOptional({ description: 'Whether this time is billable' })
  @IsBoolean()
  @IsOptional()
  billable?: boolean;

  @ApiPropertyOptional({ description: 'Notes for the time entry' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class StopTimeEntryDto {
  @ApiPropertyOptional({ description: 'End time (defaults to now)' })
  @IsDateString()
  @IsOptional()
  endTime?: string;

  @ApiPropertyOptional({ description: 'Notes for the time entry' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateTimeEntryDto {
  @ApiPropertyOptional({ description: 'Start time' })
  @IsDateString()
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional({ description: 'End time' })
  @IsDateString()
  @IsOptional()
  endTime?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Billable status' })
  @IsBoolean()
  @IsOptional()
  billable?: boolean;
}
