import { Body, Controller, HttpCode, HttpStatus, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { minutes, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { Language } from '../../../common/i18n';
import { I18nLang, I18nService } from '../../../common/i18n';
import { SkipTenant } from '../../tenants/decorators/skip-tenant.decorator';
import { ClientPortalAuthResponseDto, ClientPortalMessageResponseDto } from '../dto/client-portal-openapi.dto';
import { ClientTokenResponseDto, RequestMagicLinkDto, VerifyMagicLinkDto } from '../dto/client-auth.dto';
import { ClientTokenGuard } from '../guards/client-token.guard';
import { ClientAuthService } from '../services/client-auth.service';

@ApiTags('Client Portal')
@Controller('client-portal')
@SkipTenant()
export class ClientPortalAuthController {
  constructor(
    private readonly clientAuthService: ClientAuthService,
    @Inject(I18nService)
    private readonly i18nService: I18nService,
  ) {}

  @Post(':slug/auth/request-magic-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a magic link login email' })
  @ApiBody({ type: RequestMagicLinkDto })
  @ApiOkResponse({ description: 'Magic link request processed', type: ClientPortalMessageResponseDto })
  @Throttle({ default: { limit: 3, ttl: minutes(1) } })
  async requestMagicLink(
    @Param('slug') slug: string,
    @Body() dto: RequestMagicLinkDto,
    @I18nLang() lang: Language,
  ): Promise<{ message: string }> {
    return this.clientAuthService.requestMagicLink(slug, dto.email, lang);
  }

  @Post('auth/verify')
  @ApiOperation({ summary: 'Verify magic link token and get access token' })
  @ApiBody({ type: VerifyMagicLinkDto })
  @ApiCreatedResponse({ description: 'Magic link verified', type: ClientPortalAuthResponseDto })
  async verifyMagicLink(@Body() dto: VerifyMagicLinkDto): Promise<ClientTokenResponseDto> {
    const result = await this.clientAuthService.verifyMagicLink(dto.token);
    return {
      accessToken: result.accessToken,
      expiresAt: new Date(Date.now() + result.expiresIn * 1000),
      client: {
        id: result.client.id,
        name: result.client.name,
        email: result.client.email,
        tenantSlug: dto.tenantSlug,
      },
    };
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and invalidate token' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  @ApiOkResponse({ type: ClientPortalMessageResponseDto })
  async logout(@Req() req: Request, @I18nLang() lang: Language): Promise<{ message: string }> {
    const token = req.headers['x-client-token'] as string;
    await this.clientAuthService.logout(token);
    return { message: this.i18nService.translate('operations.logout_success', { lang }) };
  }
}
