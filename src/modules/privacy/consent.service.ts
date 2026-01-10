import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { ConsentResponseDto, GrantConsentDto } from './dto/consent.dto';
import { Consent, ConsentType } from './entities/consent.entity';

interface ConsentContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(
    @InjectRepository(Consent)
    private readonly consentRepository: Repository<Consent>,
  ) {}

  async getConsents(userId: string): Promise<ConsentResponseDto[]> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }

    const consents = await this.consentRepository.find({
      where: { userId, tenantId },
    });

    return consents.map((c) => ({
      type: c.type,
      granted: c.granted,
      grantedAt: c.grantedAt,
      revokedAt: c.revokedAt,
      policyVersion: c.policyVersion,
    }));
  }

  async grantConsent(
    userId: string,
    dto: GrantConsentDto,
    context?: ConsentContext,
  ): Promise<ConsentResponseDto> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }

    let consent = await this.consentRepository.findOne({
      where: { userId, tenantId, type: dto.type },
    });

    if (!consent) {
      consent = this.consentRepository.create({
        userId,
        tenantId,
        type: dto.type,
      });
    }

    consent.grant(context?.ipAddress, context?.userAgent, dto.policyVersion);
    await this.consentRepository.save(consent);

    this.logger.log({
      message: 'Consent granted',
      userId,
      type: dto.type,
      policyVersion: dto.policyVersion,
    });

    return {
      type: consent.type,
      granted: consent.granted,
      grantedAt: consent.grantedAt,
      revokedAt: consent.revokedAt,
      policyVersion: consent.policyVersion,
    };
  }

  async revokeConsent(
    userId: string,
    type: ConsentType,
  ): Promise<ConsentResponseDto> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }

    const consent = await this.consentRepository.findOne({
      where: { userId, tenantId, type },
    });

    if (!consent) {
      throw new BadRequestException('Consent not found');
    }

    consent.revoke();
    await this.consentRepository.save(consent);

    this.logger.log({
      message: 'Consent revoked',
      userId,
      type,
    });

    return {
      type: consent.type,
      granted: consent.granted,
      grantedAt: consent.grantedAt,
      revokedAt: consent.revokedAt,
      policyVersion: consent.policyVersion,
    };
  }

  async hasConsent(userId: string, type: ConsentType): Promise<boolean> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      return false;
    }

    const consent = await this.consentRepository.findOne({
      where: { userId, tenantId, type, granted: true },
    });

    return consent !== null;
  }

  async requireConsent(userId: string, type: ConsentType): Promise<void> {
    const hasConsent = await this.hasConsent(userId, type);
    if (!hasConsent) {
      throw new BadRequestException(
        `User must grant ${type} consent to proceed`,
      );
    }
  }
}
