import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { CombinedPaginationDto } from '../../../common/dto/combined-pagination.dto';
import { TaskStatus } from '../enums/task-status.enum';

export class TaskFilterDto extends CombinedPaginationDto {
  @ApiPropertyOptional({ enum: TaskStatus, description: 'Filter by task status' })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ description: 'Filter by assigned user ID' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional({ description: 'Filter by booking ID' })
  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @ApiPropertyOptional({ description: 'Filter by task type ID' })
  @IsOptional()
  @IsUUID()
  taskTypeId?: string;

  @ApiPropertyOptional({ description: 'Start date for due date range (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dueDateStart?: string;

  @ApiPropertyOptional({ description: 'End date for due date range (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dueDateEnd?: string;

  @ApiPropertyOptional({ description: 'Search in notes and task type name' })
  @IsOptional()
  @IsString()
  search?: string;
}
