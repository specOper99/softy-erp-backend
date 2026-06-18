/**
 * Resource Ownership Guard
 *
 * Verifies that the authenticated user has ownership rights to the requested resource.
 * Shadow mode: legacy decision remains authoritative; CASL evaluation is compared and metered.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { Client } from '../../modules/bookings/entities/client.entity';
import { User } from '../../modules/users/entities/user.entity';
import { Role } from '../../modules/users/enums/role.enum';
import { AbilityFactory, type AppAction, type AppSubject } from '../authorization/ability.factory';
import { CaslShadowMetric } from '../authorization/casl-shadow.metric';
import { TenantContextService } from '../services/tenant-context.service';
import { toErrorMessage } from '../utils/error.util';

export const RESOURCE_OWNERSHIP_KEY = 'resource_ownership';

export interface ResourceOwnershipConfig {
  resourceType: AppSubject;
  paramName: string;
  ownerField: string;
  userField?: string;
  allowRoles?: Role[];
  errorMessage?: string;
}

export const ResourceOwnership = (config: ResourceOwnershipConfig) => SetMetadata(RESOURCE_OWNERSHIP_KEY, config);

interface RequestWithUser extends Request {
  user?: User & { clientId?: string };
}

type OwnershipEvaluation =
  | { allowed: true }
  | { allowed: false; reason: 'missing_user_value' | 'ownership_mismatch' | 'unsafe_field' | 'missing_param' }
  | { allowed: false; notFound: true };

@Injectable()
export class ResourceOwnershipGuard implements CanActivate {
  private readonly logger = new Logger(ResourceOwnershipGuard.name);
  private static readonly DEFAULT_ACTION: AppAction = 'read';

  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
    private readonly abilityFactory: AbilityFactory,
    private readonly caslShadowMetric: CaslShadowMetric,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = this.reflector.get<ResourceOwnershipConfig>(RESOURCE_OWNERSHIP_KEY, context.getHandler());

    if (!config) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('common.authentication_required');
    }

    const resourceIdParam = request.params[config.paramName];
    const resourceId = Array.isArray(resourceIdParam) ? resourceIdParam[0] : resourceIdParam;

    const legacyDecision = await this.evaluateLegacyDecision(user, resourceId, config);
    const caslDecision = await this.evaluateCaslDecision(user, resourceId, config, legacyDecision);

    if (legacyDecision.allowed !== caslDecision.allowed) {
      this.caslShadowMetric.recordDisagreement({
        role: user.role,
        action: ResourceOwnershipGuard.DEFAULT_ACTION,
        subject: config.resourceType,
        decision_legacy: legacyDecision.allowed ? 'allow' : 'deny',
        decision_casl: caslDecision.allowed ? 'allow' : 'deny',
      });

      this.logger.warn({
        message: 'CASL authorization shadow disagreement',
        role: user.role,
        subject: config.resourceType,
        resourceId,
        decision_legacy: legacyDecision.allowed ? 'allow' : 'deny',
        decision_casl: caslDecision.allowed ? 'allow' : 'deny',
      });
    }

    if ('notFound' in legacyDecision && legacyDecision.notFound) {
      throw new NotFoundException({
        code: 'resource.not_found_typed',
        args: { resourceType: config.resourceType, resourceId },
      });
    }

    if (!legacyDecision.allowed) {
      if (!resourceId) {
        throw new ForbiddenException('common.invalid_resource_id');
      }
      throw new ForbiddenException(config.errorMessage || 'You do not have permission to access this resource');
    }

    return true;
  }

  private async evaluateLegacyDecision(
    user: User & { clientId?: string },
    resourceId: string | undefined,
    config: ResourceOwnershipConfig,
  ): Promise<OwnershipEvaluation> {
    if (config.allowRoles?.includes(user.role)) {
      return { allowed: true };
    }

    if (!resourceId) {
      this.logger.warn(`Missing route param: ${config.paramName}`);
      return { allowed: false, reason: 'missing_param' };
    }

    return this.verifyOwnership(user, resourceId, config);
  }

  private async evaluateCaslDecision(
    user: User & { clientId?: string },
    resourceId: string | undefined,
    config: ResourceOwnershipConfig,
    legacyDecision: OwnershipEvaluation,
  ): Promise<OwnershipEvaluation> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const ability = this.abilityFactory.build({
      id: user.id,
      role: user.role,
      tenantId,
      clientId: user.clientId,
    });
    const subject = config.resourceType;
    const action = ResourceOwnershipGuard.DEFAULT_ACTION;
    void action;

    if (config.allowRoles?.includes(user.role)) {
      const bypassAllowed = ability.can('manage', 'all');
      return bypassAllowed ? { allowed: true } : { allowed: false, reason: 'ownership_mismatch' };
    }

    if (!resourceId) {
      return { allowed: false, reason: 'missing_param' };
    }

    if ('notFound' in legacyDecision && legacyDecision.notFound) {
      return { allowed: false, notFound: true };
    }

    const userField = config.userField || 'id';
    const userValue = await this.getUserFieldValue(user, userField, tenantId);
    if (!userValue) {
      return { allowed: false, reason: 'missing_user_value' };
    }

    const resource = await this.loadResource(config, resourceId, tenantId);
    if (!resource) {
      return { allowed: false, notFound: true };
    }

    const resourceOwnerValue = resource[config.ownerField];
    const instance = {
      id: resourceId,
      tenantId,
      [config.ownerField]: resourceOwnerValue,
    };

    const allowed = this.abilityFactory.canReadResource(ability, subject, instance);
    return allowed ? { allowed: true } : { allowed: false, reason: 'ownership_mismatch' };
  }

  private async verifyOwnership(
    user: User & { clientId?: string },
    resourceId: string,
    config: ResourceOwnershipConfig,
  ): Promise<OwnershipEvaluation> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const userField = config.userField || 'id';

    const safeIdentifier = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!safeIdentifier.test(config.ownerField)) {
      this.logger.error(`ResourceOwnershipGuard: unsafe ownerField rejected: "${config.ownerField}"`);
      return { allowed: false, reason: 'unsafe_field' };
    }

    const userValue = await this.getUserFieldValue(user, userField, tenantId);
    if (!userValue) {
      this.logger.debug(`User ${user.id} has no value for field ${userField}`);
      return { allowed: false, reason: 'missing_user_value' };
    }

    try {
      const resource = await this.loadResource(config, resourceId, tenantId);
      if (!resource) {
        return { allowed: false, notFound: true };
      }

      const resourceOwnerValue = resource[config.ownerField];
      return resourceOwnerValue === userValue ? { allowed: true } : { allowed: false, reason: 'ownership_mismatch' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to verify ownership for ${config.resourceType} ${resourceId}: ${toErrorMessage(error)}`,
      );
      return { allowed: false, reason: 'ownership_mismatch' };
    }
  }

  private async loadResource(
    config: ResourceOwnershipConfig,
    resourceId: string,
    tenantId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.dataSource
      .createQueryBuilder(config.resourceType, 'resource')
      .select(['resource.id', `resource.${config.ownerField}`])
      .where('resource.id = :resourceId', { resourceId })
      .andWhere('resource.tenantId = :tenantId', { tenantId })
      .getOne();
  }

  private async getUserFieldValue(
    user: User & { clientId?: string },
    field: string,
    tenantId: string,
  ): Promise<string | null> {
    switch (field) {
      case 'id':
        return user.id;
      case 'clientId': {
        if (user.clientId) {
          return user.clientId;
        }

        if (!user.email) {
          return null;
        }

        const client = await this.dataSource
          .createQueryBuilder(Client, 'client')
          .select(['client.id'])
          .where('client.tenantId = :tenantId', { tenantId })
          .andWhere('client.email = :email', { email: user.email })
          .getOne();

        return client?.id ?? null;
      }
      default:
        this.logger.error(`ResourceOwnershipGuard: unknown userField "${field}" rejected`);
        return null;
    }
  }
}
