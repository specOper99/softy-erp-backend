import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { DataSource, LessThan, MoreThan, Repository } from 'typeorm';
import { Role } from '../../common/enums';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthResponseDto, LoginDto, RegisterDto, TokensDto } from './dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { AccountLockoutService } from './services/account-lockout.service';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
}

interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessTokenExpiresIn: number; // seconds
  private readonly refreshTokenExpiresIn: number; // days

  constructor(
    private readonly usersService: UsersService,
    private readonly tenantsService: TenantsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly dataSource: DataSource,
    private readonly lockoutService: AccountLockoutService,
  ) {
    // Access token: 15 minutes by default
    this.accessTokenExpiresIn = this.configService.get<number>(
      'auth.jwtAccessExpires',
      900,
    );
    // Refresh token: 7 days by default
    this.refreshTokenExpiresIn = this.configService.get<number>(
      'auth.jwtRefreshExpires',
      7,
    );
  }

  async register(
    registerDto: RegisterDto,
    context?: RequestContext,
  ): Promise<AuthResponseDto> {
    // 1. Generate slug and validate
    const slug = registerDto.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // 2. Use transaction to ensure atomicity of tenant + user creation
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create Tenant within transaction (handle race condition)
      let tenant;
      try {
        tenant = await this.tenantsService.createWithManager(
          queryRunner.manager,
          {
            name: registerDto.companyName,
            slug,
          },
        );
      } catch (error: unknown) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          (error as { code: string }).code === '23505'
        ) {
          throw new ConflictException(
            'Tenant with this name or slug already exists',
          );
        }
        throw error;
      }

      const tenantId = tenant.id;

      // Global-unique email model: email cannot exist in any tenant
      const existingUser = await this.usersService.findByEmail(
        registerDto.email,
      );
      if (existingUser) {
        throw new ConflictException('Email already registered');
      }

      // Create User within transaction
      const user = await this.usersService.createWithManager(
        queryRunner.manager,
        {
          email: registerDto.email,
          password: registerDto.password,
          role: Role.ADMIN, // First user is Admin
          tenantId: tenantId,
        },
      );

      // Commit the transaction
      await queryRunner.commitTransaction();

      return this.generateAuthResponse(user, context);
    } catch (error: unknown) {
      // Rollback the transaction on any error
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      // Handle database unique constraint violation
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === '23505'
      ) {
        throw new BadRequestException('Email already registered');
      }
      throw error;
    } finally {
      // Release the query runner
      if (!queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }

  async login(
    loginDto: LoginDto,
    context?: RequestContext,
  ): Promise<AuthResponseDto> {
    // Check if account is locked out
    const lockoutStatus = await this.lockoutService.isLockedOut(loginDto.email);
    if (lockoutStatus.locked) {
      const remainingSecs = Math.ceil((lockoutStatus.remainingMs || 0) / 1000);
      throw new UnauthorizedException(
        `Account temporarily locked. Try again in ${remainingSecs} seconds.`,
      );
    }

    // Find user by email globally (without tenant context)
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      await this.lockoutService.recordFailedAttempt(loginDto.email);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await this.usersService.validatePassword(
      user,
      loginDto.password,
    );
    if (!isPasswordValid) {
      await this.lockoutService.recordFailedAttempt(loginDto.email);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Clear failed attempts on successful login
    await this.lockoutService.clearAttempts(loginDto.email);

    return this.generateAuthResponse(user, context);
  }

  async refreshTokens(
    refreshToken: string,
    context?: RequestContext,
  ): Promise<TokensDto> {
    // Hash the token to look it up
    const tokenHash = this.hashToken(refreshToken);
    const storedToken = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!storedToken.isValid()) {
      // If token is revoked, it might be a token reuse attack
      if (storedToken.isRevoked) {
        this.logger.warn(
          `Possible token reuse detected for user ${storedToken.userId}`,
        );
        // Revoke all tokens for this user as a security measure
        await this.revokeAllUserTokens(storedToken.userId);
      }
      throw new UnauthorizedException('Refresh token expired or revoked');
    }

    const user = storedToken.user;
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Establish tenant context based on the refresh token's user.
    // This makes refresh flows tenant-aware without requiring an access token.
    return TenantContextService.run(user.tenantId, async () => {
      // ATOMIC Token rotation: update with conditions and check affected rows
      // This prevents race conditions where two concurrent requests could both succeed
      const updateResult = await this.refreshTokenRepository.update(
        {
          id: storedToken.id,
          isRevoked: false,
          expiresAt: MoreThan(new Date()),
        },
        {
          isRevoked: true,
          lastUsedAt: new Date(),
        },
      );

      // If no rows were affected, another request already rotated this token
      if (updateResult.affected === 0) {
        this.logger.warn(
          `Refresh token race condition detected for user ${storedToken.userId}`,
        );
        throw new UnauthorizedException('Refresh token already used');
      }

      // Generate new tokens
      return this.generateTokens(user, context);
    });
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      // Revoke specific token
      const tokenHash = this.hashToken(refreshToken);
      await this.refreshTokenRepository.update(
        { tokenHash, userId },
        { isRevoked: true },
      );
    } else {
      // Revoke all tokens for user
      await this.revokeAllUserTokens(userId);
    }
  }

  async logoutAllSessions(userId: string): Promise<number> {
    const result = await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );
    return result.affected || 0;
  }

  async validateUser(payload: TokenPayload): Promise<User> {
    const user = await this.usersService.findOne(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    if (!payload.tenantId || user.tenantId !== payload.tenantId) {
      throw new UnauthorizedException('Invalid token tenant');
    }
    return user;
  }

  async getActiveSessions(userId: string): Promise<RefreshToken[]> {
    return this.refreshTokenRepository.find({
      where: {
        userId,
        isRevoked: false,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.refreshTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });
    const deleted = result.affected || 0;
    if (deleted > 0) {
      this.logger.log(`Cleaned up ${deleted} expired refresh tokens`);
    }
    return deleted;
  }

  // ============ Private Methods ============

  private async generateAuthResponse(
    user: User,
    context?: RequestContext,
  ): Promise<AuthResponseDto> {
    const tokens = await this.generateTokens(user, context);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  private async generateTokens(
    user: User,
    context?: RequestContext,
  ): Promise<TokensDto> {
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    // Generate access token (short-lived)
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.accessTokenExpiresIn,
    });

    // Generate refresh token (random string, not JWT)
    const refreshToken = this.generateRefreshToken();

    // Store refresh token hash in database
    await this.storeRefreshToken(user.id, refreshToken, context);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenExpiresIn,
    };
  }

  private generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('base64url');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async storeRefreshToken(
    userId: string,
    token: string,
    context?: RequestContext,
  ): Promise<RefreshToken> {
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.refreshTokenExpiresIn);

    const refreshToken = this.refreshTokenRepository.create({
      tokenHash,
      userId,
      expiresAt,
      userAgent: context?.userAgent?.substring(0, 500) || null,
      ipAddress: context?.ipAddress || null,
    });

    return this.refreshTokenRepository.save(refreshToken);
  }

  private async revokeAllUserTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );
  }
}
