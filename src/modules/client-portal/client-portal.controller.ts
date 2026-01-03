import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { SkipTenant } from '../../common/decorators/skip-tenant.decorator';
import { Booking } from '../bookings/entities/booking.entity';
import { Client } from '../bookings/entities/client.entity';
import {
  ClientTokenResponseDto,
  RequestMagicLinkDto,
  VerifyMagicLinkDto,
} from './dto/client-auth.dto';
import { ClientAuthService } from './services/client-auth.service';

// Simple guard to validate client token from header
@Injectable()
class ClientTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers['x-client-token'];
    if (!token) {
      throw new UnauthorizedException('Client token required');
    }
    return true;
  }
}

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
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  // ============ AUTHENTICATION ============

  @Post('auth/request-magic-link')
  @ApiOperation({ summary: 'Request a magic link login email' })
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 requests per minute
  async requestMagicLink(
    @Body() dto: RequestMagicLinkDto,
  ): Promise<{ message: string }> {
    return this.clientAuthService.requestMagicLink(dto.email);
  }

  @Post('auth/verify')
  @ApiOperation({ summary: 'Verify magic link token and get access token' })
  async verifyMagicLink(
    @Body() dto: VerifyMagicLinkDto,
  ): Promise<ClientTokenResponseDto> {
    const result = await this.clientAuthService.verifyMagicLink(dto.token);
    return {
      accessToken: result.accessToken,
      expiresAt: result.expiresAt,
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
  async getMyBookings(@Req() req: Request): Promise<Booking[]> {
    const token = req.headers['x-client-token'] as string;
    const client = await this.clientAuthService.validateClientToken(token);

    if (!client) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return this.bookingRepository.find({
      where: { clientId: client.id, tenantId: client.tenantId },
      relations: ['servicePackage'],
      order: { eventDate: 'DESC' },
    });
  }

  @Get('bookings/:id')
  @ApiOperation({ summary: 'Get a specific booking' })
  @UseGuards(ClientTokenGuard)
  async getBooking(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<Booking> {
    const token = req.headers['x-client-token'] as string;
    const client = await this.clientAuthService.validateClientToken(token);

    if (!client) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const booking = await this.bookingRepository.findOne({
      where: { id, clientId: client.id, tenantId: client.tenantId },
      relations: ['servicePackage', 'tasks'],
    });

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
    const token = req.headers['x-client-token'] as string;
    const client = await this.clientAuthService.validateClientToken(token);

    if (!client) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return {
      id: client.id,
      name: client.name,
      email: client.email,
      phone: client.phone,
    };
  }
}
