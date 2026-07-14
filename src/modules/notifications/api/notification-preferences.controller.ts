import { Body, Controller, Get, ParseArrayPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { User } from '../../users/domain/entities/user.entity';
import { UpdateNotificationPreferenceDto } from './dto/notification-preference.dto';
import { NotificationPreference } from '../domain/entities/notification-preference.entity';
import { NotificationPreferencesService } from '../application/notification-preferences.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications/preferences')
export class NotificationPreferencesController {
  constructor(private readonly preferencesService: NotificationPreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user notification preferences' })
  @ApiResponse({ status: 200, type: NotificationPreference, isArray: true })
  async getUserPreferences(@CurrentUser() user: User) {
    return this.preferencesService.getUserPreferences(user.id);
  }

  @Put()
  @ApiOperation({ summary: 'Update notification preferences' })
  async updatePreferences(
    @CurrentUser() user: User,
    @Body(
      new ParseArrayPipe({
        items: UpdateNotificationPreferenceDto,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: UpdateNotificationPreferenceDto[],
  ) {
    return this.preferencesService.updatePreferences(user.id, body);
  }
}
