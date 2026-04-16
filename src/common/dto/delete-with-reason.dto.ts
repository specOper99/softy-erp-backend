import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DeleteWithReasonDto {
  @ApiPropertyOptional({
    description: 'Optional reason for deletion — stored in audit trail for soft-deleted entities.',
    maxLength: 500,
    example: 'Duplicate record — merged into ID abc-123.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
