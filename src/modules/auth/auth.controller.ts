import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { minutes, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser, SkipTenant } from '../../common/decorators';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import {
  AuthResponseDto,
  LoginDto,
  LogoutDto,
  RefreshTokenDto,
  RegisterDto,
  TokensDto,
} from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @SkipTenant()
  @Throttle({ default: { limit: 5, ttl: minutes(1) } }) // 5 attempts per minute
  @ApiOperation({ summary: 'Register a new user' })
  async register(
    @Body() registerDto: RegisterDto,
    @Req() req: Request,
    @Ip() ip: string,
  ): Promise<AuthResponseDto> {
    return this.authService.register(registerDto, {
      userAgent: req.headers['user-agent'],
      ipAddress: ip,
    });
  }

  @Post('login')
  @SkipTenant()
  @Throttle({ default: { limit: 5, ttl: minutes(1) } }) // 5 attempts per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Ip() ip: string,
  ): Promise<AuthResponseDto> {
    return this.authService.login(loginDto, {
      userAgent: req.headers['user-agent'],
      ipAddress: ip,
    });
  }

  @Post('refresh')
  @SkipTenant()
  @Throttle({ default: { limit: 10, ttl: minutes(1) } }) // 10 attempts per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  async refreshTokens(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Ip() ip: string,
  ): Promise<TokensDto> {
    return this.authService.refreshTokens(dto.refreshToken, {
      userAgent: req.headers['user-agent'],
      ipAddress: ip,
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout (revoke refresh token)' })
  async logout(
    @CurrentUser() user: User,
    @Body() dto: LogoutDto,
  ): Promise<void> {
    if (dto.allSessions) {
      await this.authService.logoutAllSessions(user.id);
    } else {
      await this.authService.logout(user.id, dto.refreshToken);
    }
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get active sessions for current user' })
  async getSessions(@CurrentUser() user: User) {
    const sessions = await this.authService.getActiveSessions(user.id);
    return sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
    }));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user info' })
  getCurrentUser(@CurrentUser() user: User) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };
  }
}
