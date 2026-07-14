import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class StartImpersonationDto {
  @ApiProperty({ format: 'uuid', description: 'ID of the user to impersonate' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'Reason for impersonation (audit trail)' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'Support ticket ID authorising this impersonation' })
  @IsOptional()
  @IsString()
  approvalTicketId?: string;
}

export class EndImpersonationDto {
  @ApiPropertyOptional({ description: 'Optional notes when ending impersonation' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class SearchTenantsDto {
  @ApiProperty({ description: 'Full-text search query' })
  @IsString()
  query: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number = 10;
}

export class TenantLogsQueryDto {
  @ApiPropertyOptional({ description: 'Log level filter (e.g. error, warn, info)' })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional({ description: 'Module name filter' })
  @IsOptional()
  @IsString()
  module?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 1000, default: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  limit?: number = 100;
}

export class TenantErrorsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by error type/code' })
  @IsOptional()
  @IsString()
  errorType?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 50;
}
