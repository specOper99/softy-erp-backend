import { Body, Controller, Delete, Get, Inject, Ip, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators';
import { I18nLang, I18nService } from '../../common/i18n';
import type { Language } from '../../common/i18n';
import { User } from '../users/entities/user.entity';
import { CreatePrivacyRequestDto } from './dto/privacy.dto';
import { GrantConsentDto, RevokeConsentDto, ConsentResponseDto } from './dto/consent.dto';
import { PrivacyService } from './privacy.service';
import { ConsentService } from './consent.service';
import { PrivacyRequest } from './entities/privacy-request.entity';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../users/enums/role.enum';

@ApiTags('privacy')
@ApiBearerAuth()
@Controller('privacy')
@UseGuards(JwtAuthGuard)
export class PrivacyController {
  constructor(
    private readonly privacyService: PrivacyService,
    private readonly consentService: ConsentService,
    @Inject(I18nService)
    private readonly i18nService: I18nService,
  ) {}

  @Post('requests')
  @ApiOperation({
    summary: 'Create a privacy request (data export or deletion)',
  })
  async createRequest(@CurrentUser() user: User, @Body() dto: CreatePrivacyRequestDto): Promise<PrivacyRequest> {
    return this.privacyService.createRequest(user.id, dto);
  }

  @Get('requests')
  @ApiOperation({ summary: 'Get my privacy requests' })
  async getMyRequests(@CurrentUser() user: User): Promise<PrivacyRequest[]> {
    return this.privacyService.getMyRequests(user.id);
  }

  @Get('requests/:id')
  @ApiOperation({ summary: 'Get a specific privacy request' })
  async getRequest(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<PrivacyRequest> {
    return this.privacyService.getRequestById(id, user.id);
  }

  @Delete('requests/:id')
  @ApiOperation({ summary: 'Cancel a pending privacy request' })
  async cancelRequest(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<PrivacyRequest> {
    return this.privacyService.cancelRequest(id, user.id);
  }

  @Post('requests/:id/process-export')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Process a data export request (Admin only)' })
  async processExport(
    @Param('id', ParseUUIDPipe) id: string,
    @I18nLang() lang: Language,
  ): Promise<{ message: string }> {
    await this.privacyService.processDataExport(id);
    return { message: this.i18nService.translate('operations.data_export_processed', { lang }) };
  }

  @Post('requests/:id/process-deletion')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Process a data deletion request (Admin only)' })
  async processDeletion(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @I18nLang() lang: Language,
  ): Promise<{ message: string }> {
    await this.privacyService.processDataDeletion(id, user.id);
    return { message: this.i18nService.translate('operations.data_deletion_processed', { lang }) };
  }

  @Get('admin/pending')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get all pending privacy requests (Admin only)' })
  async getPendingRequests(): Promise<PrivacyRequest[]> {
    return this.privacyService.getPendingRequests();
  }

  @Get('consents')
  @ApiOperation({ summary: 'Get all consents for current user' })
  async getConsents(@CurrentUser() user: User): Promise<ConsentResponseDto[]> {
    return this.consentService.getConsents(user.id);
  }

  @Post('consents')
  @ApiOperation({ summary: 'Grant consent' })
  async grantConsent(
    @CurrentUser() user: User,
    @Body() dto: GrantConsentDto,
    @Req() req: Request,
    @Ip() ip: string,
  ): Promise<ConsentResponseDto> {
    return this.consentService.grantConsent(user.id, dto, {
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Delete('consents/:type')
  @ApiOperation({ summary: 'Revoke consent' })
  async revokeConsent(@CurrentUser() user: User, @Param('type') type: string): Promise<ConsentResponseDto> {
    return this.consentService.revokeConsent(user.id, type as RevokeConsentDto['type']);
  }
}
