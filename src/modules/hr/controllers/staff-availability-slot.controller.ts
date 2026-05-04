import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, CurrentUser } from '../../../common/decorators';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { resolveRequestedUserIdScope } from '../../../common/helpers/field-staff-user-scope.helper';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import {
  CreateStaffAvailabilitySlotDto,
  ListStaffAvailabilitySlotsDto,
  UpdateStaffAvailabilitySlotDto,
} from '../dto/staff-availability-slot.dto';
import { StaffAvailabilitySlotService } from '../services/staff-availability-slot.service';

@ApiTags('HR Staff Availability')
@ApiBearerAuth()
@ApiErrorResponses('BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'UNPROCESSABLE_ENTITY', 'TOO_MANY_REQUESTS')
@Controller('hr/staff-availability')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffAvailabilitySlotController {
  constructor(private readonly service: StaffAvailabilitySlotService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Create a staff availability slot (Admin/OpsManager)' })
  @ApiBody({ type: CreateStaffAvailabilitySlotDto })
  @ApiResponse({ status: 201, description: 'Slot created' })
  create(@Body() dto: CreateStaffAvailabilitySlotDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({ summary: 'List staff availability slots' })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Slot list returned' })
  findAll(@Query() query: ListStaffAvailabilitySlotsDto, @CurrentUser() user: User) {
    if (user.role === Role.FIELD_STAFF) {
      const scopedUserId = resolveRequestedUserIdScope(user);
      return this.service.findAll(query, scopedUserId);
    }
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({ summary: 'Get a staff availability slot by ID' })
  @ApiResponse({ status: 200, description: 'Slot returned' })
  @ApiResponse({ status: 404, description: 'Slot not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    const slot = await this.service.findOne(id);
    if (user.role === Role.FIELD_STAFF) {
      resolveRequestedUserIdScope(user, slot.userId);
    }
    return slot;
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Update a staff availability slot (Admin/OpsManager)' })
  @ApiBody({ type: UpdateStaffAvailabilitySlotDto })
  @ApiResponse({ status: 200, description: 'Slot updated' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffAvailabilitySlotDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Delete a staff availability slot (Admin/OpsManager)' })
  @ApiResponse({ status: 200, description: 'Slot deleted' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
