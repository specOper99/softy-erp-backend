import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, Roles } from '../../../common/decorators';
import { MfaRequired } from '../../auth/decorators/mfa-required.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SubscriptionPlan } from '../../tenants/enums/subscription-plan.enum';
import { RequireSubscription, SubscriptionGuard } from '../../tenants/guards/subscription.guard';
import { Role } from '../../users/enums/role.enum';
import { CreateTaskTypeEligibilityDto, EligibleStaffDto, EligibleTaskTypeDto } from '../dto/task-type-eligibility.dto';
import { TaskTypeEligibility } from '../entities/task-type-eligibility.entity';
import { TaskTypeEligibilityService } from '../services/task-type-eligibility.service';
import { RolesGuard } from '../../../common/guards';

@ApiTags('HR Task Type Eligibility')
@ApiBearerAuth()
@ApiErrorResponses('BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'UNPROCESSABLE_ENTITY')
@Controller('hr/task-type-eligibility')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@RequireSubscription(SubscriptionPlan.PRO)
export class TaskTypeEligibilityController {
  constructor(private readonly taskTypeEligibilityService: TaskTypeEligibilityService) {}

  @Post()
  @Roles(Role.ADMIN)
  @MfaRequired()
  @ApiOperation({ summary: 'Create staff task type eligibility (Admin only)' })
  @ApiResponse({ status: 201, type: TaskTypeEligibility })
  create(@Body() dto: CreateTaskTypeEligibilityDto) {
    return this.taskTypeEligibilityService.createEligibility(dto);
  }

  @Delete(':userId/:taskTypeId')
  @Roles(Role.ADMIN)
  @MfaRequired()
  @ApiOperation({ summary: 'Delete staff task type eligibility (Admin only)' })
  @ApiResponse({ status: 200, description: 'Eligibility removed' })
  remove(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('taskTypeId', ParseUUIDPipe) taskTypeId: string,
  ): Promise<void> {
    return this.taskTypeEligibilityService.deleteEligibility(userId, taskTypeId);
  }

  @Get('users/:userId')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get eligible task types for a staff member' })
  @ApiResponse({ status: 200, type: EligibleTaskTypeDto, isArray: true })
  findEligibleTaskTypesForUser(@Param('userId', ParseUUIDPipe) userId: string): Promise<EligibleTaskTypeDto[]> {
    return this.taskTypeEligibilityService.getEligibleTaskTypesForUser(userId);
  }

  @Get('task-types/:taskTypeId')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get eligible staff for a task type' })
  @ApiResponse({ status: 200, type: EligibleStaffDto, isArray: true })
  findEligibleStaffForTaskType(@Param('taskTypeId', ParseUUIDPipe) taskTypeId: string): Promise<EligibleStaffDto[]> {
    return this.taskTypeEligibilityService.getEligibleStaffForTaskType(taskTypeId);
  }
}
