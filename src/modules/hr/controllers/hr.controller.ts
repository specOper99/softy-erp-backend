import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, Roles } from '../../../common/decorators';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { RolesGuard } from '../../../common/guards';
import { MfaRequired } from '../../auth/decorators/mfa-required.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SubscriptionPlan } from '../../tenants/enums/subscription-plan.enum';
import { RequireSubscription, SubscriptionGuard } from '../../tenants/guards/subscription.guard';
import { Role } from '../../users/enums/role.enum';
import { CreateProfileDto, CreateStaffDto, CreateStaffResponseDto, ProfileFilterDto, UpdateProfileDto } from '../dto';
import { HrService } from '../services/hr.service';
import { PayrollService } from '../services/payroll.service';

@ApiTags('HR')
@ApiBearerAuth()
@ApiErrorResponses(
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UNPROCESSABLE_ENTITY',
  'TOO_MANY_REQUESTS',
)
@Controller('hr')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@RequireSubscription(SubscriptionPlan.PRO)
export class HrController {
  constructor(
    private readonly hrService: HrService,
    private readonly payrollService: PayrollService,
  ) {}

  @Post('profiles')
  @Roles(Role.ADMIN)
  @MfaRequired()
  @ApiOperation({ summary: 'Create employee profile (Admin only)' })
  createProfile(@Body() dto: CreateProfileDto) {
    return this.hrService.createProfile(dto);
  }

  @Post('staff')
  @Roles(Role.ADMIN)
  @MfaRequired()
  @ApiOperation({
    summary: 'Create staff user + profile atomically',
    description:
      'Creates user and HR profile in one transaction for studio staffing flow. If profile creation fails, user creation is rolled back.',
  })
  @ApiResponse({ status: 201, description: 'Staff created successfully', type: CreateStaffResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid role or payload' })
  @ApiResponse({ status: 409, description: 'User or profile already exists' })
  createStaff(@Body() dto: CreateStaffDto): Promise<CreateStaffResponseDto> {
    return this.hrService.createStaff(dto);
  }

  @Get('profiles')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({
    summary: 'Get all employee profiles with filtering (Offset Pagination - Deprecated)',
    description:
      'Supports filtering by status, department, contract type, and search. Use /hr/profiles/cursor for better performance.',
    deprecated: true,
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'department', required: false, type: String })
  @ApiQuery({ name: 'contractType', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Return filtered profiles with pagination meta' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findAllProfilesWithFilters(@Query() query: ProfileFilterDto) {
    return this.hrService.findAllProfilesWithFilters(query);
  }

  @Get('profiles/cursor')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({
    summary: 'Get all employee profiles with filtering (Cursor Pagination - Recommended)',
    description: 'Supports filtering by status, department, contract type, and search with cursor pagination',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'department', required: false, type: String })
  @ApiQuery({ name: 'contractType', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Return filtered profiles with cursor pagination' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findAllProfilesWithFiltersCursor(@Query() query: ProfileFilterDto) {
    return this.hrService.findAllProfilesWithFiltersCursor(query);
  }

  @Get('profiles/cursor/no-filters')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get all profiles with cursor pagination (no filters)' })
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
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProfileDto) {
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
    return this.payrollService.runPayroll();
  }

  @Get('payroll/history')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Get payroll run history (Admin only, Offset Pagination)',
    deprecated: true,
    description: 'Use /hr/payroll/history/cursor for better performance with large datasets.',
  })
  getPayrollHistory(@Query() query: PaginationDto = new PaginationDto()) {
    return this.payrollService.getPayrollHistory(query);
  }

  @Get('payroll/history/cursor')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get payroll run history with cursor pagination (Admin only)' })
  getPayrollHistoryCursor(@Query() query: CursorPaginationDto) {
    return this.payrollService.getPayrollHistoryCursor(query);
  }
}
