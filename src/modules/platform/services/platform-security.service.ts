import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'node:crypto';
import { isIP } from 'node:net';
import { Repository } from 'typeorm';
import { PasswordHashService } from '../../../common/services/password-hash.service';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { PasswordService } from '../../auth/services/password.service';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { User } from '../../users/entities/user.entity';
import { PlatformAction } from '../enums/platform-action.enum';
import { PlatformAuditService } from './platform-audit.service';

interface ForcePasswordResetDto {
  tenantId: string;
  userId: string;
  reason: string;
  notifyUser?: boolean;
}

interface RevokeSessionsDto {
  tenantId: string;
  userId?: string;
  reason: string;
}

interface UpdateIpAllowlistDto {
  tenantId: string;
  allowedIps: string[];
  reason: string;
}

interface DataExportDto {
  tenantId: string;
  exportType: 'full' | 'gdpr' | 'audit';
  reason: string;
}

interface DataDeletionDto {
  tenantId: string;
  scheduleDate: Date;
  reason: string;
}

/**
 * Service for platform security and compliance operations
 */
@Injectable()
export class PlatformSecurityService {
  private readonly logger = new Logger(PlatformSecurityService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly auditService: PlatformAuditService,
    private readonly passwordHashService: PasswordHashService,
    private readonly passwordService: PasswordService,
  ) {}

  async forcePasswordReset(dto: ForcePasswordResetDto, platformUserId: string, ipAddress: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: dto.userId, tenantId: dto.tenantId } });
    if (!user) {
      throw new NotFoundException('User not found in tenant');
    }

    this.logger.log(
      `Platform user ${platformUserId} forcing password reset for user ${dto.userId} in tenant ${dto.tenantId}`,
    );

    const randomPassword = crypto.randomBytes(48).toString('base64url');
    const passwordHash = await this.passwordHashService.hash(randomPassword);
    await this.userRepository.update({ id: user.id, tenantId: user.tenantId }, { passwordHash });

    await this.refreshTokenRepository.update({ userId: user.id, isRevoked: false }, { isRevoked: true });

    if (dto.notifyUser !== false) {
      await this.passwordService.forgotPassword(user.email);
    }

    await this.auditService.log({
      platformUserId,
      action: PlatformAction.FORCE_PASSWORD_RESET,
      targetTenantId: dto.tenantId,
      targetEntityType: 'user',
      targetEntityId: dto.userId,
      reason: dto.reason,
      ipAddress,
      additionalContext: { operation: 'force_password_reset' },
    });
  }

  async revokeAllSessions(dto: RevokeSessionsDto, platformUserId: string, ipAddress: string): Promise<number> {
    const _tenant = await this.getTenantOrThrow(dto.tenantId);

    this.logger.warn(`Revoking all sessions for tenant ${dto.tenantId} by platform user ${platformUserId}`);

    const userIdSubquery = this.userRepository
      .createQueryBuilder('u')
      .select('u.id')
      .where('u.tenantId = :tenantId', { tenantId: dto.tenantId })
      .getQuery();

    const result = await this.refreshTokenRepository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ isRevoked: true })
      .where(`user_id IN (${userIdSubquery})`, { tenantId: dto.tenantId })
      .andWhere('is_revoked = false')
      .execute();
    const revoked = result.affected ?? 0;

    await this.auditService.log({
      platformUserId,
      targetTenantId: dto.tenantId,
      action: PlatformAction.SESSIONS_REVOKED,
      targetEntityType: 'session',
      reason: dto.reason,
      ipAddress,
      additionalContext: {
        operation: 'revoke_all_sessions',
        userId: dto.userId,
        revoked,
      },
    });

    return revoked;
  }

  async updateIpAllowlist(dto: UpdateIpAllowlistDto, platformUserId: string, ipAddress: string): Promise<void> {
    const tenant = await this.getTenantOrThrow(dto.tenantId);

    for (const ip of dto.allowedIps) {
      this.assertValidIpOrCidr(ip);
    }

    const beforeValue = tenant.securityPolicies || {};
    tenant.securityPolicies = {
      ...tenant.securityPolicies,
      ipAllowlist: dto.allowedIps,
      updatedAt: new Date(),
      updatedBy: platformUserId,
    };

    await this.tenantRepository.save(tenant);

    await this.auditService.log({
      platformUserId,
      targetTenantId: dto.tenantId,
      action: PlatformAction.IP_ALLOWLIST_UPDATED,
      targetEntityType: 'tenant',
      targetEntityId: dto.tenantId,
      reason: dto.reason,
      ipAddress,
      changesBefore: beforeValue,
      changesAfter: tenant.securityPolicies,
      additionalContext: { operation: 'update_ip_allowlist' },
    });

    this.logger.log(`IP allowlist updated for tenant ${dto.tenantId} by platform user ${platformUserId}`);
  }

  async initiateDataExport(
    dto: DataExportDto,
    platformUserId: string,
    ipAddress: string,
  ): Promise<{ exportId: string; estimatedCompletionTime: Date }> {
    const _tenant = await this.getTenantOrThrow(dto.tenantId);

    const exportId = `export-${Date.now()}-${crypto.randomUUID()}`;
    const estimatedCompletionTime = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

    await this.auditService.log({
      platformUserId,
      targetTenantId: dto.tenantId,
      action: PlatformAction.DATA_EXPORTED,
      targetEntityType: 'tenant',
      targetEntityId: dto.tenantId,
      reason: dto.reason,
      ipAddress,
      additionalContext: {
        exportId,
        exportType: dto.exportType,
        estimatedCompletionTime,
      },
    });

    this.logger.warn(
      `Data export initiated for tenant ${dto.tenantId} by platform user ${platformUserId} - Export ID: ${exportId}`,
    );

    return { exportId, estimatedCompletionTime };
  }

  private isValidCidr(value: string): boolean {
    const [ip = '', prefix = ''] = value.split('/');
    const ipType = isIP(ip);
    if (!ipType) return false;
    const prefixNum = Number(prefix);
    if (!Number.isInteger(prefixNum)) return false;
    return (ipType === 4 && prefixNum >= 0 && prefixNum <= 32) || (ipType === 6 && prefixNum >= 0 && prefixNum <= 128);
  }

  private assertValidIpOrCidr(value: string): void {
    if (isIP(value)) return;
    if (!this.isValidCidr(value)) {
      throw new BadRequestException(`Invalid IP or CIDR format: ${value}`);
    }
  }

  async initiateDataDeletion(
    dto: DataDeletionDto,
    platformUserId: string,
    ipAddress: string,
  ): Promise<{ scheduledDate: Date; cancellationDeadline: Date }> {
    const tenant = await this.getTenantOrThrow(dto.tenantId);

    tenant.deletionScheduledAt = dto.scheduleDate;

    await this.tenantRepository.save(tenant);

    const cancellationDeadline = new Date(dto.scheduleDate.getTime() - 24 * 60 * 60 * 1000); // 1 day before

    await this.auditService.log({
      platformUserId,
      targetTenantId: dto.tenantId,
      action: PlatformAction.DATA_DELETED,
      targetEntityType: 'tenant',
      targetEntityId: dto.tenantId,
      reason: dto.reason,
      ipAddress,
      additionalContext: {
        scheduledDate: dto.scheduleDate,
        operation: 'schedule_deletion',
      },
    });

    this.logger.warn(
      `Data deletion scheduled for tenant ${dto.tenantId} on ${dto.scheduleDate.toISOString()} by platform user ${platformUserId}`,
    );

    return {
      scheduledDate: dto.scheduleDate,
      cancellationDeadline,
    };
  }

  async getTenantRiskScore(tenantId: string): Promise<number> {
    const tenant = await this.getTenantOrThrow(tenantId, {
      select: ['id', 'riskScore', 'complianceFlags'],
    });

    return Number(tenant.riskScore) || 0;
  }

  async updateSecurityPolicy(
    tenantId: string,
    policy: Record<string, unknown>,
    platformUserId: string,
    reason: string,
    ipAddress: string,
  ): Promise<void> {
    const tenant = await this.getTenantOrThrow(tenantId);

    const beforeValue = tenant.securityPolicies || {};
    tenant.securityPolicies = {
      ...tenant.securityPolicies,
      ...policy,
      updatedAt: new Date(),
      updatedBy: platformUserId,
    };

    await this.tenantRepository.save(tenant);

    await this.auditService.log({
      platformUserId,
      targetTenantId: tenantId,
      action: PlatformAction.SECURITY_POLICY_UPDATED,
      targetEntityType: 'tenant',
      targetEntityId: tenantId,
      reason,
      ipAddress,
      changesBefore: beforeValue,
      changesAfter: tenant.securityPolicies,
      additionalContext: { operation: 'update_security_policy' },
    });
  }
  private async getTenantOrThrow(
    tenantId: string,
    options?: import('typeorm').FindOneOptions<Tenant>,
  ): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({
      ...options,
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }
}
