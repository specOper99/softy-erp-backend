import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ClonePackageDto {
  @ApiProperty({ description: 'Name for the new cloned package' })
  @IsNotEmpty()
  @IsString()
  newName: string;

  @ApiPropertyOptional({ description: 'Optional price override for the clone' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  newPrice?: number;

  @ApiPropertyOptional({ description: 'Optional description override' })
  @IsOptional()
  @IsString()
  description?: string;
}
