import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * Filter DTO for client listing with text search.
 *
 * Extends offset pagination and adds a free-text search field
 * that matches against client name, email, and phone.
 */
export class ClientFilterDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Search in client name, email, or phone',
    example: 'Ahmed',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
