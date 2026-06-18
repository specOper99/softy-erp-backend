import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { ApiErrorResponses, CurrentUser } from '../../../common/decorators';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { resolveRequestedUserIdScope } from '../../../common/helpers/field-staff-user-scope.helper';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import {
  CreateAttendanceDto,
  AttendanceResponseDto,
  ListAttendanceDto,
  UpdateAttendanceDto,
} from '../dto/attendance.dto';
import { AttendanceService } from '../services/attendance.service';
import { toErrorMessage } from '../../../common/utils/error.util';

@ApiTags('HR Attendance')
@ApiBearerAuth()
@ApiExtraModels(AttendanceResponseDto, ListAttendanceDto)
@ApiErrorResponses('BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'UNPROCESSABLE_ENTITY', 'TOO_MANY_REQUESTS')
@Controller('hr/attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  private readonly logger = new Logger(AttendanceController.name);

  constructor(private readonly attendanceService: AttendanceService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({ summary: 'Create attendance record' })
  @ApiCreatedResponse({ description: 'Attendance created', type: AttendanceResponseDto })
  @ApiBody({ type: CreateAttendanceDto })
  create(@Body() createAttendanceDto: CreateAttendanceDto, @CurrentUser() user: User) {
    if (user.role === Role.FIELD_STAFF) {
      try {
        resolveRequestedUserIdScope(user, createAttendanceDto.userId);
      } catch (error) {
        this.logger.warn(`Attendance create forbidden for field staff ${user.id}: ${toErrorMessage(error)}`);
        throw new ForbiddenException('hr.attendance_self_only_create');
      }
    }

    return this.attendanceService.create(createAttendanceDto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({ summary: 'List attendance records' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiOkResponse({ description: 'Attendance list returned', type: AttendanceResponseDto, isArray: true })
  findAll(@Query() query: ListAttendanceDto = new ListAttendanceDto(), @CurrentUser() user: User) {
    if (user.role === Role.FIELD_STAFF) {
      const scopedUserId = resolveRequestedUserIdScope(user);
      return this.attendanceService.findAll(query, scopedUserId);
    }
    if (query.userId && !isUUID(query.userId)) {
      throw new BadRequestException('hr.attendance_invalid_user_id');
    }
    return this.attendanceService.findAll(query, query.userId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({ summary: 'Get attendance by ID' })
  @ApiOkResponse({ description: 'Attendance returned', type: AttendanceResponseDto })
  @ApiResponse({ status: 404, description: 'Attendance not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    const attendance = await this.attendanceService.findOne(id);
    if (user.role === Role.FIELD_STAFF) {
      try {
        resolveRequestedUserIdScope(user, attendance.userId);
      } catch (error) {
        this.logger.warn(
          `Attendance view forbidden for field staff ${user.id} on record ${id}: ${toErrorMessage(error)}`,
        );
        throw new ForbiddenException('hr.attendance_self_only_view');
      }
    }

    return attendance;
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Update attendance record' })
  @ApiOkResponse({ description: 'Attendance updated', type: AttendanceResponseDto })
  @ApiBody({ type: UpdateAttendanceDto })
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
