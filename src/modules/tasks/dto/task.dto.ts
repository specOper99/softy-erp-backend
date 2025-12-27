import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { TaskStatus } from '../../../common/enums';

export class AssignTaskDto {
  @ApiProperty({ description: 'User ID to assign the task to' })
  @IsUUID()
  userId: string;
}

export class UpdateTaskDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  assignedUserId?: string;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class TaskResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  bookingId: string;

  @ApiProperty()
  taskTypeId: string;

  @ApiPropertyOptional()
  assignedUserId: string | null;

  @ApiProperty({ enum: TaskStatus })
  status: TaskStatus;

  @ApiProperty()
  commissionSnapshot: number;

  @ApiPropertyOptional()
  dueDate: Date | null;

  @ApiPropertyOptional()
  completedAt: Date | null;

  @ApiPropertyOptional()
  notes: string;

  @ApiProperty()
  createdAt: Date;
}

export class CompleteTaskResponseDto {
  @ApiProperty()
  task: TaskResponseDto;

  @ApiProperty()
  commissionAccrued: number;

  @ApiProperty()
  walletUpdated: boolean;
}
