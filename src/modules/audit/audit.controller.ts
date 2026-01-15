import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Role } from '../users/enums/role.enum';
import { AuditService } from './audit.service';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({
    summary: 'Get audit logs with cursor pagination (Admin only)',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Cursor for pagination',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of items to return',
  })
  @ApiQuery({
    name: 'entityName',
    required: false,
    description: 'Filter by entity name',
  })
  @ApiQuery({
    name: 'action',
    required: false,
    description: 'Filter by action type',
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Filter by user ID',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Filter by start date (ISO format)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Filter by end date (ISO format)',
  })
  @ApiResponse({ status: 200, description: 'Return paginated audit logs' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  findAllCursor(@Query() query: AuditLogFilterDto) {
    return this.auditService.findAllCursor(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get audit log by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'Audit log details' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  @ApiResponse({ status: 404, description: 'Audit log not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const log = await this.auditService.findOne(id);
    if (!log) {
      throw new NotFoundException(`Audit log with ID ${id} not found`);
    }
    return log;
  }
}
