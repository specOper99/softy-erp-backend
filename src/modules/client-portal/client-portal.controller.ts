import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { SkipTenant } from '../../modules/tenants/decorators/skip-tenant.decorator';
import { Booking } from '../bookings/entities/booking.entity';
import { Client } from '../bookings/entities/client.entity';
import { ClientTokenResponseDto, RequestMagicLinkDto, VerifyMagicLinkDto } from './dto/client-auth.dto';
import { ClientTokenGuard } from './guards/client-token.guard';
import { ClientAuthService } from './services/client-auth.service';
import { ClientPortalService } from './services/client-portal.service';

@ApiTags('Client Portal')
@ApiHeader({
  name: 'x-client-token',
  description: 'Magic link access token for the client',
  required: false,
})
@Controller('client-portal')
@SkipTenant() // Client portal uses its own authentication, not JWT
export class ClientPortalController {
  constructor(
    private readonly clientAuthService: ClientAuthService,
    private readonly clientPortalService: ClientPortalService,
  ) {}

  // ============ AUTHENTICATION ============

  @Post(':slug/auth/request-magic-link')
  @ApiOperation({ summary: 'Request a magic link login email' })
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 requests per minute
  async requestMagicLink(@Param('slug') slug: string, @Body() dto: RequestMagicLinkDto): Promise<{ message: string }> {
    return this.clientAuthService.requestMagicLink(slug, dto.email);
  }

  @Post('auth/verify')
  @ApiOperation({ summary: 'Verify magic link token and get access token' })
  async verifyMagicLink(@Body() dto: VerifyMagicLinkDto): Promise<ClientTokenResponseDto> {
    const result = await this.clientAuthService.verifyMagicLink(dto.token);
    return {
      accessToken: result.accessToken,
      expiresAt: new Date(Date.now() + result.expiresIn * 1000),
      client: {
        id: result.client.id,
        name: result.client.name,
        email: result.client.email,
      },
    };
  }

  @Post('auth/logout')
  @ApiOperation({ summary: 'Logout and invalidate token' })
  @UseGuards(ClientTokenGuard)
  async logout(@Req() req: Request): Promise<{ message: string }> {
    const token = req.headers['x-client-token'] as string;
    await this.clientAuthService.logout(token);
    return { message: 'Logged out successfully' };
  }

  // ============ BOOKINGS ============

  @Get('bookings')
  @ApiOperation({ summary: 'Get all bookings for the authenticated client' })
  @UseGuards(ClientTokenGuard)
  async getMyBookings(@Req() req: Request, @Query() query: PaginationDto = new PaginationDto()): Promise<Booking[]> {
    const client = this.getClientFromRequest(req);

    return this.clientPortalService.getMyBookings(client.id, client.tenantId, query);
  }

  @Get('bookings/:id')
  @ApiOperation({ summary: 'Get a specific booking' })
  @UseGuards(ClientTokenGuard)
  async getBooking(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<Booking> {
    const client = this.getClientFromRequest(req);

    const booking = await this.clientPortalService.getBooking(id, client.id, client.tenantId);

    if (!booking) {
      throw new UnauthorizedException('Booking not found');
    }

    return booking;
  }

  // ============ PROFILE ============

  @Get('profile')
  @ApiOperation({ summary: 'Get authenticated client profile' })
  @UseGuards(ClientTokenGuard)
  async getProfile(@Req() req: Request): Promise<Partial<Client>> {
    const client = this.getClientFromRequest(req);

    return this.clientPortalService.getClientProfile(client.id, client.tenantId);
  }

  private getClientFromRequest(req: Request): Client {
    const client = (req as Request & { client?: Client }).client;
    if (!client) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return client;
  }
}
