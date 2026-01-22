import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import { CreateAttendanceDto, UpdateAttendanceDto } from '../dto/attendance.dto';
import { AttendanceService } from '../services/attendance.service';

@ApiTags('HR Attendance')
@ApiBearerAuth()
@Controller('hr/attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  create(@Body() createAttendanceDto: CreateAttendanceDto, @CurrentUser() user: User) {
    if (user.role === Role.FIELD_STAFF && createAttendanceDto.userId !== user.id) {
      throw new ForbiddenException('Field staff can only create attendance records for themselves');
    }
    return this.attendanceService.create(createAttendanceDto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  findAll(@Query('userId') userId: string | undefined, @CurrentUser() user: User) {
    if (user.role === Role.FIELD_STAFF) {
      return this.attendanceService.findAll(user.id);
    }
    return this.attendanceService.findAll(userId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  async findOne(@Param('id') id: string, @CurrentUser() user: User) {
    const attendance = await this.attendanceService.findOne(id);
    if (user.role === Role.FIELD_STAFF && attendance.userId !== user.id) {
      throw new ForbiddenException('Field staff can only view their own attendance records');
    }
    return attendance;
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  update(@Param('id') id: string, @Body() updateAttendanceDto: UpdateAttendanceDto) {
    return this.attendanceService.update(id, updateAttendanceDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.attendanceService.remove(id);
  }
}
