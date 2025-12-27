import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/enums';
import { RolesGuard } from '../../common/guards';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../users/entities/user.entity';
import { AssignTaskDto, UpdateTaskDto } from './dto';
import { TasksService } from './tasks.service';

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
  start(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasksService.startTask(id);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Complete task (accrues commission to wallet)' })
  complete(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasksService.completeTask(id);
  }
}
