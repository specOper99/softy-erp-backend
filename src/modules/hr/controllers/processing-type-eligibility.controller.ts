import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, Roles } from '../../../common/decorators';
import { MfaRequired } from '../../auth/decorators/mfa-required.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SubscriptionPlan } from '../../tenants/enums/subscription-plan.enum';
import { RequireSubscription, SubscriptionGuard } from '../../tenants/guards/subscription.guard';
import { Role } from '../../users/enums/role.enum';
import {
  CreateProcessingTypeEligibilityDto,
  EligibleProcessingTypeDto,
  EligibleStaffDto,
} from '../dto/processing-type-eligibility.dto';
import { ProcessingTypeEligibility } from '../entities/processing-type-eligibility.entity';
import { ProcessingTypeEligibilityService } from '../services/processing-type-eligibility.service';
import { RolesGuard } from '../../../common/guards';

@ApiTags('HR Processing Type Eligibility')
@ApiBearerAuth()
@ApiErrorResponses('BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'UNPROCESSABLE_ENTITY')
@Controller('hr/processing-type-eligibility')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@RequireSubscription(SubscriptionPlan.PRO)
export class ProcessingTypeEligibilityController {
  constructor(private readonly service: ProcessingTypeEligibilityService) {}

  @Post()
  @Roles(Role.ADMIN)
  @MfaRequired()
  @ApiOperation({ summary: 'Create staff processing type eligibility (Admin only)' })
  @ApiResponse({ status: 201, type: ProcessingTypeEligibility })
  create(@Body() dto: CreateProcessingTypeEligibilityDto) {
    return this.service.createEligibility(dto);
  }

  @Delete(':userId/:processingTypeId')
  @Roles(Role.ADMIN)
  @MfaRequired()
  @ApiOperation({ summary: 'Delete staff processing type eligibility (Admin only)' })
  @ApiResponse({ status: 200, description: 'Eligibility removed' })
  remove(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('processingTypeId', ParseUUIDPipe) processingTypeId: string,
  ): Promise<void> {
    return this.service.deleteEligibility(userId, processingTypeId);
  }

  @Get('users/:userId')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get eligible processing types for a staff member' })
  @ApiResponse({ status: 200, type: EligibleProcessingTypeDto, isArray: true })
  findEligibleProcessingTypesForUser(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<EligibleProcessingTypeDto[]> {
    return this.service.getEligibleProcessingTypesForUser(userId);
  }

  @Get('processing-types/:processingTypeId')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get eligible staff for a processing type' })
  @ApiResponse({ status: 200, type: EligibleStaffDto, isArray: true })
  findEligibleStaffForProcessingType(
    @Param('processingTypeId', ParseUUIDPipe) processingTypeId: string,
  ): Promise<EligibleStaffDto[]> {
    return this.service.getEligibleStaffForProcessingType(processingTypeId);
  }
}
