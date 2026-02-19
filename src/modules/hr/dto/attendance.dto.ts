import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { AttendanceStatus, LeaveType } from '../entities/attendance.entity';

export class BaseAttendanceDto {
  @ApiPropertyOptional({ description: 'Check-in timestamp (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  checkIn?: string;

  @ApiPropertyOptional({ description: 'Check-out timestamp (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  checkOut?: string;

  @ApiPropertyOptional({ enum: AttendanceStatus, description: 'Attendance status for the day' })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @ApiPropertyOptional({ enum: LeaveType, description: 'Leave type when status is LEAVE/SICK/etc.' })
  @IsOptional()
  @IsEnum(LeaveType)
  leaveType?: LeaveType;

  @ApiPropertyOptional({ description: 'Optional attendance notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateAttendanceDto extends BaseAttendanceDto {
  @ApiProperty({ format: 'uuid', description: 'Employee user ID' })
  @IsNotEmpty()
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'Attendance date (ISO 8601 date)', example: '2026-02-18' })
  @IsNotEmpty()
  @IsDateString()
  date: string;
}

export class UpdateAttendanceDto extends PartialType(BaseAttendanceDto) {
  @ApiPropertyOptional({ format: 'uuid', description: 'Approver user ID' })
  @IsOptional()
  @IsUUID()
  approvedBy?: string;

  @ApiPropertyOptional({ description: 'Approval timestamp (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  approvedAt?: string;
}

export class ListAttendanceDto extends PaginationDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filter attendance by employee user ID' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
