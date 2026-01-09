import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { RolesGuard } from '../../../common/guards';
import { MfaRequired } from '../../auth/decorators/mfa-required.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SubscriptionPlan } from '../../tenants/enums/subscription-plan.enum';
import {
  RequireSubscription,
  SubscriptionGuard,
} from '../../tenants/guards/subscription.guard';
import { Role } from '../../users/enums/role.enum';
import { CreateProfileDto, UpdateProfileDto } from '../dto';
import { HrService } from '../services/hr.service';

@ApiTags('HR')
@ApiBearerAuth()
@Controller('hr')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@RequireSubscription(SubscriptionPlan.PRO)
export class HrController {
  constructor(private readonly hrService: HrService) {}

  @Post('profiles')
  @Roles(Role.ADMIN)
  @MfaRequired()
  @ApiOperation({ summary: 'Create employee profile (Admin only)' })
  createProfile(@Body() dto: CreateProfileDto) {
    return this.hrService.createProfile(dto);
  }

  @Get('profiles')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get all employee profiles' })
  findAllProfiles(@Query() query: PaginationDto = new PaginationDto()) {
    return this.hrService.findAllProfiles(query);
  }

  @Get('profiles/cursor')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get all profiles with cursor pagination' })
  findAllProfilesCursor(@Query() query: CursorPaginationDto) {
    return this.hrService.findAllProfilesCursor(query);
  }

  @Get('profiles/:id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get profile by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.hrService.findProfileById(id);
  }

  @Get('profiles/user/:userId')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get profile by user ID' })
  findByUserId(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.hrService.findProfileByUserId(userId);
  }

  @Patch('profiles/:id')
  @Roles(Role.ADMIN)
  @MfaRequired()
  @ApiOperation({ summary: 'Update profile (Admin only)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.hrService.updateProfile(id, dto);
  }

  @Delete('profiles/:id')
  @Roles(Role.ADMIN)
  @MfaRequired()
  @ApiOperation({ summary: 'Delete profile (Admin only)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.hrService.deleteProfile(id);
  }

  @Post('payroll/run')
  @Roles(Role.ADMIN)
  @MfaRequired()
  @ApiOperation({ summary: 'Run payroll manually (Admin only)' })
  runPayroll() {
    return this.hrService.runPayroll();
  }

  @Get('payroll/history')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get payroll run history (Admin only)' })
  getPayrollHistory(@Query() query: PaginationDto = new PaginationDto()) {
    return this.hrService.getPayrollHistory(query);
  }
}
