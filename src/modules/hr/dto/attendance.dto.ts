import { PartialType } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { AttendanceStatus, LeaveType } from '../entities/attendance.entity';

export class BaseAttendanceDto {
  @IsOptional()
  @IsDateString()
  checkIn?: string;

  @IsOptional()
  @IsDateString()
  checkOut?: string;

  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @IsOptional()
  @IsEnum(LeaveType)
  leaveType?: LeaveType;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateAttendanceDto extends BaseAttendanceDto {
  @IsNotEmpty()
  @IsUUID()
  userId: string;

  @IsNotEmpty()
  @IsDateString()
  date: string;
}

export class UpdateAttendanceDto extends PartialType(BaseAttendanceDto) {
  @IsOptional()
  @IsUUID()
  approvedBy?: string;

  @IsOptional()
  @IsDateString()
  approvedAt?: string;
}
