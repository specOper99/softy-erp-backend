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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, CurrentUser } from '../../../common/decorators';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import { CreateAttendanceDto, ListAttendanceDto, UpdateAttendanceDto } from '../dto/attendance.dto';
import { AttendanceService } from '../services/attendance.service';

@ApiTags('HR Attendance')
@ApiBearerAuth()
@ApiErrorResponses('BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'UNPROCESSABLE_ENTITY', 'TOO_MANY_REQUESTS')
@Controller('hr/attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({ summary: 'Create attendance record' })
  @ApiResponse({ status: 201, description: 'Attendance created' })
  create(@Body() createAttendanceDto: CreateAttendanceDto, @CurrentUser() user: User) {
    if (user.role === Role.FIELD_STAFF && createAttendanceDto.userId !== user.id) {
      throw new ForbiddenException('Field staff can only create attendance records for themselves');
    }
    return this.attendanceService.create(createAttendanceDto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({ summary: 'List attendance records' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Attendance list returned' })
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
  @ApiOperation({ summary: 'Get attendance by ID' })
  @ApiResponse({ status: 200, description: 'Attendance returned' })
  @ApiResponse({ status: 404, description: 'Attendance not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    const attendance = await this.attendanceService.findOne(id);
    if (user.role === Role.FIELD_STAFF && attendance.userId !== user.id) {
      throw new ForbiddenException('Field staff can only view their own attendance records');
    }
    return attendance;
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Update attendance record' })
  @ApiResponse({ status: 200, description: 'Attendance updated' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateAttendanceDto: UpdateAttendanceDto) {
    return this.attendanceService.update(id, updateAttendanceDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete attendance record' })
  @ApiResponse({ status: 200, description: 'Attendance removed' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.attendanceService.remove(id);
  }
}
