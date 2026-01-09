import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Role } from '../../users/enums/role.enum';
import { User } from '../../users/entities/user.entity';
import {
  StartTimeEntryDto,
  StopTimeEntryDto,
  UpdateTimeEntryDto,
} from '../dto/time-entry.dto';
import { TimeEntriesService } from '../services/time-entries.service';

@ApiTags('Time Entries')
@ApiBearerAuth()
@Controller('tasks/time-entries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TimeEntriesController {
  constructor(private readonly timeEntriesService: TimeEntriesService) {}

  @Post('start')
  @ApiOperation({ summary: 'Start a timer for a task' })
  async startTimer(@CurrentUser() user: User, @Body() dto: StartTimeEntryDto) {
    return this.timeEntriesService.startTimer(user.id, dto);
  }

  @Post(':id/stop')
  @ApiOperation({ summary: 'Stop an active timer' })
  async stopTimer(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StopTimeEntryDto,
  ) {
    return this.timeEntriesService.stopTimer(user.id, id, dto);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get current active timer for logged in user' })
  async getActiveTimer(@CurrentUser() user: User) {
    return this.timeEntriesService.getActiveTimer(user.id);
  }

  @Get('task/:taskId')
  @ApiOperation({ summary: 'Get all time entries for a specific task' })
  async getTaskTimeEntries(@Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.timeEntriesService.getTaskTimeEntries(taskId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a time entry' })
  async update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTimeEntryDto,
  ) {
    return this.timeEntriesService.update(user.id, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Delete a time entry' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.timeEntriesService.delete(id);
  }
}
