import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiErrorResponses, CurrentUser, Roles } from '../../../common/decorators';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { RolesGuard } from '../../../common/guards';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import { AssignTaskDto, TaskFilterDto, UpdateTaskDto } from '../dto';
import { TaskStatus } from '../enums/task-status.enum';
import { TasksService } from '../services/tasks.service';

@ApiTags('Tasks')
@ApiBearerAuth()
@ApiErrorResponses('BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'UNPROCESSABLE_ENTITY', 'TOO_MANY_REQUESTS')
@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({
    summary: 'Get all tasks with filtering (Offset Pagination - Deprecated)',
    description:
      'Supports filtering by status, assignedUserId, bookingId, date range, and search. Use /tasks/cursor for better performance.',
    deprecated: true,
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: TaskStatus })
  @ApiQuery({ name: 'bookingId', required: false, type: String })
  @ApiQuery({ name: 'assignedUserId', required: false, type: String })
  @ApiQuery({ name: 'dueDateStart', required: false, type: String })
  @ApiQuery({ name: 'dueDateEnd', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Return filtered tasks with pagination meta' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async findAllWithFilters(@Query() query: TaskFilterDto) {
    return this.tasksService.findAllWithFilters(query);
  }

  @Get('cursor')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({
    summary: 'Get all tasks with filtering (Cursor Pagination - Recommended)',
    description:
      'Supports filtering by status, assignedUserId, bookingId, date range, and search with cursor pagination',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: TaskStatus })
  @ApiQuery({ name: 'bookingId', required: false, type: String })
  @ApiQuery({ name: 'assignedUserId', required: false, type: String })
  @ApiQuery({ name: 'dueDateStart', required: false, type: String })
  @ApiQuery({ name: 'dueDateEnd', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Return filtered tasks with cursor pagination' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async findAllWithFiltersCursor(@Query() query: TaskFilterDto) {
    return this.tasksService.findAllWithFiltersCursor(query);
  }

  @Get('cursor/no-filters')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get all tasks using keyset pagination (no filters)' })
  @ApiResponse({ status: 200, description: 'Return paginated tasks' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  findAllCursor(@Query() query: CursorPaginationDto) {
    return this.tasksService.findAllCursor(query);
  }

  @Get('export')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Export all tasks to CSV' })
  @ApiResponse({ status: 200, description: 'CSV file download' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async exportTasks(@Res() res: Response) {
    return this.tasksService.exportToCSV(res);
  }

  @Get('my-tasks')
  @ApiOperation({ summary: 'Get current user tasks' })
  @ApiResponse({ status: 200, description: 'Return user tasks' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findMyTasks(@CurrentUser() user: User) {
    return this.tasksService.findByUser(user.id);
  }

  @Get('booking/:bookingId')
  @ApiOperation({ summary: 'Get tasks by booking ID' })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Return booking tasks' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  findByBooking(@Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.tasksService.findByBooking(bookingId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({ summary: 'Get task by ID' })
  @ApiResponse({ status: 200, description: 'Task retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasksService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Update task' })
  @ApiResponse({ status: 200, description: 'Task updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, dto);
  }

  @Patch(':id/assign')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Assign task to user' })
  @ApiResponse({ status: 200, description: 'Task assigned successfully' })
  @ApiResponse({ status: 400, description: 'User does not belong to tenant' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignTaskDto) {
    return this.tasksService.assignTask(id, dto);
  }

  @Patch(':id/start')
  @ApiOperation({ summary: 'Start task (changes status to IN_PROGRESS)' })
  @ApiResponse({ status: 200, description: 'Task started' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.tasksService.startTask(id, user);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Complete task (accrues commission to wallet)' })
  @ApiResponse({ status: 200, description: 'Task completed, commission credited' })
  @ApiResponse({ status: 400, description: 'Task already completed or not assigned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.tasksService.completeTask(id, user);
  }
}
