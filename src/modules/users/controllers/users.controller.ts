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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { RolesGuard } from '../../../common/guards';
import { MfaRequired } from '../../auth/decorators/mfa-required.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantQuotaGuard } from '../../tenants/guards/tenant-quota.guard';
import { CreateUserDto, UpdateUserDto } from '../dto';
import { Role } from '../enums/role.enum';
import { UsersService } from '../services/users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard, TenantQuotaGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.ADMIN)
  @MfaRequired()
  @ApiOperation({ summary: 'Create a new user (Admin only, MFA required)' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
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
  @ApiResponse({ status: 200, description: 'Return all users' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  findAll(@Query() query: PaginationDto) {
    return this.usersService.findAll(query);
  }

  @Get('cursor')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get all users with cursor pagination' })
  @ApiResponse({ status: 200, description: 'Return paginated users' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  findAllCursor(@Query() query: CursorPaginationDto) {
    return this.usersService.findAllCursor(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @MfaRequired()
  @ApiOperation({ summary: 'Update user (Admin only, MFA required)' })
  @ApiResponse({ status: 200, description: 'User updated' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions or MFA missing' })
  @ApiResponse({ status: 404, description: 'User not found' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @MfaRequired()
  @ApiOperation({ summary: 'Delete user (Admin only, MFA required)' })
  @ApiResponse({ status: 200, description: 'User deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions or MFA missing' })
  @ApiResponse({ status: 404, description: 'User not found' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }
}
