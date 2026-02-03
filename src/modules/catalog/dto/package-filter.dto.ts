import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { CombinedPaginationDto } from '../../../common/dto/combined-pagination.dto';

export class PackageFilterDto extends CombinedPaginationDto {
  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Search in package name or description' })
  @IsOptional()
  @IsString()
  search?: string;
}
