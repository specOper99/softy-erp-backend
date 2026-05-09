import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { SkipTenant } from '../../tenants/decorators/skip-tenant.decorator';
import { Client } from '../../bookings/entities/client.entity';
import { ClientsService } from '../../bookings/services/clients.service';
import { UpdateClientDto } from '../../bookings/dto/client.dto';
import { NotificationService } from '../../notifications/services/notification.service';
import { TenantsService } from '../../tenants/tenants.service';
import {
  ClientPortalNotificationPreferencesDto,
  ClientPortalProfileResponseDto,
} from '../dto/client-portal-openapi.dto';
import { UpdateClientProfileDto } from '../dto/update-profile.dto';
import { ClientTokenGuard } from '../guards/client-token.guard';
import { ClientPortalService } from '../services/client-portal.service';

@ApiTags('Client Portal')
@Controller('client-portal')
@SkipTenant()
export class ClientPortalProfileController {
  constructor(
    private readonly clientPortalService: ClientPortalService,
    private readonly clientsService: ClientsService,
    private readonly tenantsService: TenantsService,
    private readonly notificationService: NotificationService,
  ) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get authenticated client profile' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  @ApiOkResponse({ type: ClientPortalProfileResponseDto })
  async getProfile(@Req() req: Request): Promise<ClientPortalProfileResponseDto> {
    const client = this.getClientFromRequest(req);
    const profile = await this.clientPortalService.getClientProfile(client.id, client.tenantId);
    const tenant = await this.tenantsService.findOne(client.tenantId);

    return {
      id: profile.id ?? client.id,
      email: profile.email ?? client.email,
      name: profile.name ?? client.name,
      phone: profile.phone ?? client.phone,
      tenantSlug: tenant.slug,
      company: tenant.name,
      location: tenant.address ?? undefined,
      joinedAt: client.createdAt,
    };
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update client profile' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  @ApiBody({ type: UpdateClientProfileDto })
  @ApiOkResponse({ type: ClientPortalProfileResponseDto })
  async updateProfile(
    @Req() req: Request,
    @Body() dto: UpdateClientProfileDto,
  ): Promise<ClientPortalProfileResponseDto> {
    const client = this.getClientFromRequest(req);
    const updateDto: UpdateClientDto = {};

    if (dto.name !== undefined) updateDto.name = dto.name;
    if (dto.phone !== undefined) updateDto.phone = dto.phone;

    if (dto.emailNotifications !== undefined || dto.inAppNotifications !== undefined) {
      const currentPrefs = client.notificationPreferences ?? { email: false, inApp: false };
      updateDto.notificationPreferences = {
        email: dto.emailNotifications ?? currentPrefs.email,
        inApp: dto.inAppNotifications ?? currentPrefs.inApp,
        marketing: currentPrefs.marketing ?? currentPrefs.email,
        reminders: currentPrefs.reminders ?? currentPrefs.inApp,
        updates: currentPrefs.updates ?? currentPrefs.inApp,
      };
    }

    const updated = await TenantContextService.run(client.tenantId, async () =>
      this.clientsService.update(client.id, updateDto),
    );
    const tenant = await this.tenantsService.findOne(client.tenantId);

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      phone: updated.phone,
      tenantSlug: tenant.slug,
      company: tenant.name,
      location: tenant.address ?? undefined,
      joinedAt: updated.createdAt,
    };
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Get client notifications' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getNotifications(@Req() req: Request, @Query() pagination: PaginationDto = new PaginationDto()) {
    const client = this.getClientFromRequest(req);
    const [notifications, total] = await TenantContextService.run(client.tenantId, async () =>
      this.notificationService.findByClient(client.tenantId, client.id, pagination),
    );

    return {
      data: notifications,
      total,
      page: pagination.page ?? 1,
      limit: pagination.limit ?? 10,
    };
  }

  @Post('notifications/:id/mark-read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  async markNotificationRead(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const client = this.getClientFromRequest(req);
    await this.notificationService.markAsReadForClient(client.tenantId, client.id, id);
    return { success: true };
  }

  @Get('notifications/preferences')
  @ApiOperation({ summary: 'Get client notification preferences' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  @ApiOkResponse({ type: ClientPortalNotificationPreferencesDto })
  async getNotificationPreferences(@Req() req: Request): Promise<ClientPortalNotificationPreferencesDto> {
    const client = this.getClientFromRequest(req);
    const prefs = client.notificationPreferences ?? { email: false, inApp: false };
    return {
      marketing: prefs.marketing ?? prefs.email,
      reminders: prefs.reminders ?? prefs.inApp,
      updates: prefs.updates ?? prefs.inApp,
    };
  }

  @Put('notifications/preferences')
  @ApiOperation({ summary: 'Update client notification preferences' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  @ApiBody({ type: ClientPortalNotificationPreferencesDto })
  @ApiOkResponse({ type: ClientPortalNotificationPreferencesDto })
  async updateNotificationPreferences(
    @Req() req: Request,
    @Body() dto: ClientPortalNotificationPreferencesDto,
  ): Promise<ClientPortalNotificationPreferencesDto> {
    const client = this.getClientFromRequest(req);
    await TenantContextService.run(client.tenantId, async () =>
      this.clientsService.update(client.id, {
        notificationPreferences: {
          email: dto.marketing,
          inApp: dto.reminders || dto.updates,
          marketing: dto.marketing,
          reminders: dto.reminders,
          updates: dto.updates,
        },
      }),
    );

    return dto;
  }

  private getClientFromRequest(req: Request): Client {
    const client = (req as Request & { client?: Client }).client;
    if (!client) {
      throw new UnauthorizedException('auth.invalid_or_expired_token');
    }
    return client;
  }
}
