import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../../../common/decorators';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { RolesGuard } from '../../../common/guards';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import { AssignTaskDto, UpdateTaskDto } from '../dto';
import { TasksService } from '../services/tasks.service';

@ApiTags('Tasks')
@ApiBearerAuth()
@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get all tasks' })
  findAll() {
    return this.tasksService.findAll();
  }

  @Get('cursor')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get all tasks using keyset pagination' })
  findAllCursor(@Query() query: CursorPaginationDto) {
    return this.tasksService.findAllCursor(query);
  }

  @Get('export')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Export all tasks to CSV' })
  async exportTasks(@Res() res: Response) {
    return this.tasksService.exportToCSV(res);
  }

  @Get('my-tasks')
  @ApiOperation({ summary: 'Get current user tasks' })
  findMyTasks(@CurrentUser() user: User) {
    return this.tasksService.findByUser(user.id);
  }

  @Get('booking/:bookingId')
  @ApiOperation({ summary: 'Get tasks by booking ID' })
  findByBooking(@Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.tasksService.findByBooking(bookingId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasksService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Update task' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, dto);
  }

  @Patch(':id/assign')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Assign task to user' })
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignTaskDto) {
    return this.tasksService.assignTask(id, dto);
  }

  @Patch(':id/start')
  @ApiOperation({ summary: 'Start task (changes status to IN_PROGRESS)' })
  start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.tasksService.startTask(id, user);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Complete task (accrues commission to wallet)' })
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.tasksService.completeTask(id, user);
  }
}
