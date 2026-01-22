import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../users/entities/user.entity';
import { UpdateNotificationPreferenceDto } from '../dto/notification-preference.dto';
import { NotificationPreferencesService } from '../services/notification-preferences.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications/preferences')
export class NotificationPreferencesController {
  constructor(private readonly preferencesService: NotificationPreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user notification preferences' })
  async getUserPreferences(@CurrentUser() user: User) {
    return this.preferencesService.getUserPreferences(user.id);
  }

  @Put()
  @ApiOperation({ summary: 'Update notification preferences' })
  async updatePreferences(@CurrentUser() user: User, @Body() body: UpdateNotificationPreferenceDto[]) {
    return this.preferencesService.updatePreferences(user.id, body);
  }
}
