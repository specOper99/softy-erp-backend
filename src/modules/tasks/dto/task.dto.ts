import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { SanitizeHtml } from '../../../common/decorators/sanitize-html.decorator';
import { TaskAssigneeRole } from '../enums/task-assignee-role.enum';
import { TaskStatus } from '../enums/task-status.enum';

export class AssignTaskDto {
  @ApiProperty({ description: 'User ID to assign the task to' })
  @IsUUID()
  userId: string;
}

export class AddTaskAssigneeDto {
  @ApiProperty({ description: 'User ID to assign to this task' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ enum: TaskAssigneeRole, default: TaskAssigneeRole.ASSISTANT })
  @IsOptional()
  @IsEnum(TaskAssigneeRole)
  role?: TaskAssigneeRole;

  @ApiPropertyOptional({ description: 'Pending commission snapshot for this assignee (must be > 0)' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  commissionSnapshot?: number;
}

export class UpdateTaskAssigneeDto {
  @ApiProperty({ enum: TaskAssigneeRole })
  @IsEnum(TaskAssigneeRole)
  role: TaskAssigneeRole;
}

export class UpdateTaskDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  assignedUserId?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  notes?: string;

  @ApiPropertyOptional({ description: 'Parent task ID for subtasks' })
  @IsUUID()
  @IsOptional()
  parentId?: string;
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

  @ApiPropertyOptional()
  completedAt: Date | null;

  @ApiPropertyOptional()
  notes: string;

  @ApiPropertyOptional({ description: 'Parent task ID if this is a subtask' })
  parentId: string | null;

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
