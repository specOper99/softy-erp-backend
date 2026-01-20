import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordHashService } from '../../../common/services/password-hash.service';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { PlatformAction } from '../enums/platform-action.enum';
import { PlatformAuditService } from './platform-audit.service';

interface ForcePasswordResetDto {
  userId: string;
  reason: string;
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
    private readonly auditService: PlatformAuditService,
    private readonly passwordHashService: PasswordHashService,
  ) {}

  async forcePasswordReset(dto: ForcePasswordResetDto, platformUserId: string, ipAddress: string): Promise<void> {
    this.logger.log(`Platform user ${platformUserId} forcing password reset for user ${dto.userId}`);

    await this.auditService.log({
      platformUserId,
      action: PlatformAction.FORCE_PASSWORD_RESET,
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
      },
    });

    return 0; // Would integrate with session management
  }

  async updateIpAllowlist(dto: UpdateIpAllowlistDto, platformUserId: string, ipAddress: string): Promise<void> {
    const tenant = await this.getTenantOrThrow(dto.tenantId);

    // Validate CIDR format
    const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    for (const ip of dto.allowedIps) {
      if (!cidrRegex.test(ip)) {
        throw new BadRequestException(`Invalid IP or CIDR format: ${ip}`);
      }
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

    const exportId = `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
