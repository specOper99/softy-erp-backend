import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

export class AuditLogFilterDto extends CursorPaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by entity name (e.g., Booking, Task)',
  })
  @IsOptional()
  @IsString()
  entityName?: string;

  @ApiPropertyOptional({
    description: 'Filter by action type (e.g., CREATE, UPDATE, DELETE)',
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by start date (ISO 8601 format)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter by end date (ISO 8601 format)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
