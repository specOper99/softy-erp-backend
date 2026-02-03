import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CombinedPaginationDto } from '../../../common/dto/combined-pagination.dto';
import { ContractType } from '../enums/contract-type.enum';
import { ProfileStatus } from '../enums/profile-status.enum';

export class ProfileFilterDto extends CombinedPaginationDto {
  @ApiPropertyOptional({ enum: ProfileStatus, description: 'Filter by profile status' })
  @IsOptional()
  @IsEnum(ProfileStatus)
  status?: ProfileStatus;

  @ApiPropertyOptional({ description: 'Filter by department' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ enum: ContractType, description: 'Filter by contract type' })
  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType;

  @ApiPropertyOptional({ description: 'Search in employee name or employee ID' })
  @IsOptional()
  @IsString()
  search?: string;
}
