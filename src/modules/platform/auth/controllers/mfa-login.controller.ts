import { Body, Controller, HttpCode, HttpStatus, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { minutes, SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { SkipTenant } from '../../../tenants/decorators/skip-tenant.decorator';
import { MFAVerifyLoginDto, PlatformAuthResponseDto } from '../dto';
import { PlatformAuthService } from '../services/platform-auth.service';
import { MFAService } from '../../services/mfa.service';
import { PlatformUser } from '../../entities/platform-user.entity';

@ApiTags('Platform - MFA Login')
@Controller('platform/mfa')
@UseGuards(ThrottlerGuard)
@SkipThrottle({ short: true, medium: true, long: true })
@SkipTenant()
export class MfaLoginController {
  constructor(
    private readonly platformAuthService: PlatformAuthService,
    private readonly mfaService: MFAService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(PlatformUser)
    private readonly platformUserRepository: Repository<PlatformUser>,
  ) {}

  @Post('verify-login')
  @Throttle({ default: { limit: 5, ttl: minutes(1) } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify MFA code during platform login' })
  @ApiBody({ type: MFAVerifyLoginDto })
  @ApiOkResponse({ description: 'MFA verification successful, tokens issued', type: PlatformAuthResponseDto })
  async verifyLogin(@Body() dto: MFAVerifyLoginDto, @Req() req: Request): Promise<PlatformAuthResponseDto> {
    const { code, tempToken } = dto;

    let userId: string;
    try {
      const platformSecret = this.configService.getOrThrow<string>('PLATFORM_JWT_SECRET');
      const payload = this.jwtService.verify<{ sub: string }>(tempToken, {
        secret: platformSecret,
        audience: 'platform',
      });
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException('auth.invalid_mfa_token');
    }

    // mfaSecret has select:false on entity, so we need explicit select
    const user = await this.platformUserRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'fullName', 'role', 'status', 'mfaEnabled', 'mfaSecret'],
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('auth.invalid_user');
    }

    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedException('auth.mfa_not_enabled');
    }

    const isValid = this.mfaService.verifyToken(user.mfaSecret, code);
    if (!isValid) {
      throw new UnauthorizedException('auth.invalid_mfa_code');
    }

    const context = {
      userAgent: req.headers['user-agent'] || undefined,
      ipAddress: req.ip || req.socket.remoteAddress || undefined,
    };

    return this.platformAuthService.generateTokensForUser(userId, context);
  }
}
