import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import { CreateAttendanceDto, ListAttendanceDto, UpdateAttendanceDto } from '../dto/attendance.dto';
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
  findAll(@Query() query: ListAttendanceDto = new ListAttendanceDto(), @CurrentUser() user: User) {
    if (user.role === Role.FIELD_STAFF) {
      return this.attendanceService.findAll(query, user.id);
    }
    if (query.userId && !isUUID(query.userId)) {
      throw new BadRequestException('Invalid userId');
    }
    return this.attendanceService.findAll(query, query.userId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    const attendance = await this.attendanceService.findOne(id);
    if (user.role === Role.FIELD_STAFF && attendance.userId !== user.id) {
      throw new ForbiddenException('Field staff can only view their own attendance records');
    }
    return attendance;
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateAttendanceDto: UpdateAttendanceDto) {
    return this.attendanceService.update(id, updateAttendanceDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.attendanceService.remove(id);
  }
}
