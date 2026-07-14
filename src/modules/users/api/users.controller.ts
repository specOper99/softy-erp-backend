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
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorResponses, Roles } from '../../../common/decorators';
import { RolesGuard } from '../../../common/guards';
import { MfaRequired } from '../../auth/infrastructure/decorators/mfa-required.decorator';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { MfaRequiredGuard } from '../../auth/infrastructure/guards/mfa-required.guard';
import { TenantQuotaGuard } from '../../tenants/infrastructure/guards/tenant-quota.guard';
import { DeleteWithReasonDto } from '../../../common/dto/delete-with-reason.dto';
import { CreateUserDto, UpdateUserDto, UserCursorResponseDto, UserFilterDto, UserResponseDto } from './dto';
import { Role } from '../domain/enums/role.enum';
import { UsersService } from '../application/users.service';

@ApiTags('Users')
@ApiBearerAuth()
@ApiExtraModels(UserResponseDto, UserCursorResponseDto)
@ApiErrorResponses('UNAUTHORIZED', 'FORBIDDEN', 'TOO_MANY_REQUESTS')
@Controller('users')
@UseGuards(JwtAuthGuard, MfaRequiredGuard, RolesGuard, TenantQuotaGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.ADMIN)
  @MfaRequired()
  @ApiOperation({
    summary: 'Create a new user (Admin only, MFA required)',
    description:
      'Tenant Admin can create users within the current tenant only. Recommended roles for studio staff management are OPS_MANAGER, FIELD_STAFF, and CLIENT.',
  })
  @ApiResponse({ status: 201, description: 'User created successfully', type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input or duplicate email' })
  @ApiResponse({ status: 403, description: 'MFA required or insufficient permissions' })
  @SetMetadata('quotaResource', 'max_users')
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({
    summary: 'Get all users (Offset Pagination)',
    deprecated: true,
    description: 'Use /users/cursor for better performance with large datasets.',
  })
  @ApiOkResponse({ description: 'Return all users', type: UserResponseDto, isArray: true })
  @ApiResponse({ status: 401, description: 'common.unauthorized_plain' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiQuery({ name: 'role', enum: Role, required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  findAll(@Query() query: UserFilterDto) {
    return this.usersService.findAll(query);
  }

  @Get('cursor')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({
    summary: 'Get all users with cursor pagination',
    description: 'Returns users from current tenant only. Supports role, isActive and search filters.',
  })
  @ApiOkResponse({
    description: 'Return paginated users',
    schema: { $ref: getSchemaPath(UserCursorResponseDto) },
  })
  @ApiResponse({ status: 401, description: 'common.unauthorized_plain' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'role', enum: Role, required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'] })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAllCursor(@Query() query: UserFilterDto) {
    return this.usersService.findAllCursor(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiOkResponse({ description: 'User retrieved', type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'common.unauthorized_plain' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'common.user_not_found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @MfaRequired()
  @ApiOperation({ summary: 'Update user (Admin only, MFA required)' })
  @ApiResponse({ status: 200, description: 'User updated', type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'common.unauthorized_plain' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions or MFA missing' })
  @ApiResponse({ status: 404, description: 'common.user_not_found' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @MfaRequired()
  @ApiOperation({ summary: 'Delete user (Admin only, MFA required)' })
  @ApiResponse({ status: 200, description: 'User deleted' })
  @ApiResponse({ status: 401, description: 'common.unauthorized_plain' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions or MFA missing' })
  @ApiResponse({ status: 404, description: 'common.user_not_found' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DeleteWithReasonDto) {
    return this.usersService.remove(id, dto.reason);
  }
}
