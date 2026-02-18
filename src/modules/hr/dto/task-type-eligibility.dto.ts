import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { Role } from '../../users/enums/role.enum';

export class CreateTaskTypeEligibilityDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty()
  @IsUUID()
  taskTypeId: string;
}

export class EligibleTaskTypeDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string;

  @ApiProperty()
  isActive: boolean;
}

export class EligibleStaffProfileDto {
  @ApiPropertyOptional()
  firstName?: string;

  @ApiPropertyOptional()
  lastName?: string;

  @ApiPropertyOptional()
  jobTitle?: string;
}

export class EligibleStaffDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiPropertyOptional({ type: EligibleStaffProfileDto })
  profile: EligibleStaffProfileDto | null;
}
