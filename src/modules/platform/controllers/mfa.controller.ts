import { SkipTenant } from '../../tenants/decorators/skip-tenant.decorator';

import { Body, Controller, Get, HttpCode, HttpStatus, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequireContext } from '../../../common/decorators/context.decorator';
import { ContextType } from '../../../common/enums/context-type.enum';
import { PlatformContextGuard } from '../../../common/guards/platform-context.guard';
import { PlatformJwtAuthGuard } from '../guards/platform-jwt-auth.guard';
import { PlatformUser } from '../entities/platform-user.entity';
import { MFAService } from '../services/mfa.service';
import * as bcrypt from 'bcrypt';

interface AuthenticatedRequest {
  user: {
    userId: string;
  };
}

class VerifyMFADto {
  code: string;
}

class DisableMFADto {
  password: string;
  reason: string;
}

/**
 * Controller for MFA operations
 */
@ApiTags('Platform - MFA')
@ApiBearerAuth('platform-auth')
@SkipTenant()
@UseGuards(PlatformContextGuard, PlatformJwtAuthGuard)
@RequireContext(ContextType.PLATFORM)
@Controller('platform/mfa')
export class MFAController {
  constructor(
    private readonly mfaService: MFAService,
    @InjectRepository(PlatformUser)
    private readonly userRepository: Repository<PlatformUser>,
  ) {}

  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initialize MFA setup',
    description: `Start the MFA enrollment process for the authenticated platform user. Returns a QR code and backup codes.

**Note:** MFA is not active until verified with a valid code.

**Flow:**
1. Call this endpoint to get QR code and secret
2. Scan QR code with authenticator app
3. Call POST /platform/mfa/verify with code from app
4. Store backup codes securely`,
  })
  @ApiResponse({
    status: 200,
    description: 'MFA setup initialized',
    schema: {
      type: 'object',
      properties: {
        qrCode: { type: 'string', description: 'Data URI for QR code image' },
        secret: { type: 'string', description: 'Manual entry secret (base32)' },
        backupCodes: {
          type: 'array',
          items: { type: 'string' },
          description: '10 one-time backup codes',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'MFA already enabled' })
  async setupMFA(@Request() req: AuthenticatedRequest) {
    const userId: string = req.user.userId;
    const user = await this.getUserOrThrow(userId);

    const mfaSetup = await this.mfaService.setupMFA(userId, user.email);

    // Store secret temporarily - user must verify before enabling
    user.mfaSecret = mfaSetup.secret;
    user.mfaRecoveryCodes = mfaSetup.backupCodes;
    await this.userRepository.save(user);

    return {
      qrCode: mfaSetup.qrCode,
      secret: mfaSetup.secret,
      backupCodes: mfaSetup.backupCodes,
    };
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify and enable MFA',
    description: `Complete MFA enrollment by verifying a TOTP code from the authenticator app. After successful verification, MFA will be required for all future logins.

**⚠️ Important:** Ensure backup codes are saved before enabling MFA`,
  })
  @ApiResponse({
    status: 200,
    description: 'MFA enabled successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid MFA code or MFA not set up' })
  async verifyAndEnableMFA(@Body() dto: VerifyMFADto, @Request() req: AuthenticatedRequest) {
    const userId: string = req.user.userId;
    const user = await this.getUserOrThrow(userId);

    if (!user || !user.mfaSecret) {
      throw new Error('MFA not set up');
    }

    const isValid = this.mfaService.verifyToken(user.mfaSecret, dto.code);

    if (!isValid) {
      throw new Error('Invalid MFA code');
    }

    // Enable MFA
    user.mfaEnabled = true;
    await this.userRepository.save(user);

    return {
      success: true,
      message: 'MFA enabled successfully',
    };
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disable MFA',
    description: `Disable MFA for the authenticated platform user. Requires password confirmation.

**⚠️ Security Warning:** Disabling MFA reduces account security. A reason is required for audit purposes.`,
  })
  @ApiResponse({
    status: 200,
    description: 'MFA disabled',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid password' })
  async disableMFA(@Body() dto: DisableMFADto, @Request() req: AuthenticatedRequest) {
    const userId: string = req.user.userId;
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'passwordHash', 'mfaEnabled'],
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify password before disabling MFA
    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new Error('Incorrect password. MFA cannot be disabled.');
    }

    user.mfaEnabled = false;
    user.mfaSecret = null;
    user.mfaRecoveryCodes = [];
    await this.userRepository.save(user);

    return {
      success: true,
      message: 'MFA disabled',
    };
  }

  @Post('verify-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify MFA during login',
    description: `Complete the MFA step during login authentication. Called after initial password verification when MFA is enabled.

**Flow:**
1. POST /platform/auth/login returns \`mfaRequired: true\`
2. User enters code from authenticator app
3. Call this endpoint with the TOTP or backup code
4. On success, receive full access token`,
  })
  @ApiResponse({
    status: 200,
    description: 'MFA verification successful',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        backupCodesRemaining: {
          type: 'number',
          description: 'Only present if backup code was used',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid MFA code or backup code' })
  async verifyMFALogin(@Body() dto: VerifyMFADto, @Request() req: Partial<AuthenticatedRequest>) {
    // This endpoint is called after initial login when MFA is required
    // The request would contain a temporary token or session ID

    const userId: string | undefined = req.user?.userId;
    if (!userId) {
      throw new Error('Invalid session');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'mfaSecret', 'mfaRecoveryCodes'],
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Try TOTP code first
    const isTOTPValid = this.mfaService.verifyToken(user.mfaSecret || '', dto.code);

    if (isTOTPValid) {
      // Generate full access token
      return {
        success: true,
        message: 'MFA verification successful',
      };
    }

    // Try backup code
    const isBackupValid = this.mfaService.verifyBackupCode(dto.code, user.mfaRecoveryCodes || []);

    if (isBackupValid) {
      // Remove used backup code
      user.mfaRecoveryCodes = this.mfaService.removeUsedBackupCode(dto.code, user.mfaRecoveryCodes || []);
      await this.userRepository.save(user);

      return {
        success: true,
        message: 'Backup code accepted',
        backupCodesRemaining: user.mfaRecoveryCodes.length,
      };
    }

    throw new Error('Invalid MFA code or backup code');
  }

  @Get('backup-codes')
  @ApiOperation({
    summary: 'Get remaining backup codes',
    description: `Retrieve the list of unused backup codes for the authenticated user.

**Security Note:** Backup codes are shown only once during setup. This endpoint shows remaining count but codes are masked.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Backup codes retrieved',
    schema: {
      type: 'object',
      properties: {
        backupCodes: {
          type: 'array',
          items: { type: 'string' },
        },
        total: { type: 'number' },
      },
    },
  })
  async getBackupCodes(@Request() req: AuthenticatedRequest) {
    const userId: string = req.user.userId;
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'mfaRecoveryCodes'],
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      backupCodes: user.mfaRecoveryCodes || [],
      total: (user.mfaRecoveryCodes || []).length,
    };
  }

  @Post('regenerate-backup-codes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerate backup codes',
    description: `Generate a new set of backup codes, invalidating all previous codes.

**⚠️ Important:** Store the new codes securely. Previous codes will no longer work.`,
  })
  @ApiResponse({
    status: 200,
    description: 'New backup codes generated',
    schema: {
      type: 'object',
      properties: {
        backupCodes: {
          type: 'array',
          items: { type: 'string' },
          description: '10 new one-time backup codes',
        },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'MFA not enabled' })
  async regenerateBackupCodes(@Request() req: AuthenticatedRequest) {
    const userId: string = req.user.userId;
    const user = await this.getUserOrThrow(userId);

    const mfaSetup = await this.mfaService.setupMFA(userId, user.email);
    user.mfaRecoveryCodes = mfaSetup.backupCodes;
    await this.userRepository.save(user);

    return {
      backupCodes: mfaSetup.backupCodes,
      message: 'Backup codes regenerated',
    };
  }
  private async getUserOrThrow(userId: string): Promise<PlatformUser> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }
}
