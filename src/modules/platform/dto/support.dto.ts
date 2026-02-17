import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class StartImpersonationDto {
  @IsUUID()
  userId: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  approvalTicketId?: string;
}

export class EndImpersonationDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class SearchTenantsDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number = 10;
}

export class TenantLogsQueryDto {
  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  limit?: number = 100;
}

export class TenantErrorsQueryDto {
  @IsOptional()
  @IsString()
  errorType?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 50;
}
