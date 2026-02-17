/**
 * Resource Ownership Guard
 *
 * Verifies that the authenticated user has ownership rights to the requested resource.
 * Used to prevent users from accessing resources that belong to other users
 * within the same tenant (e.g., client accessing another client's invoice).
 *
 * Usage:
 * 1. Apply @ResourceOwnership() decorator to controller method
 * 2. Configure the resource type and parameter name
 * 3. Guard will verify ownership before allowing access
 *
 * @example
 * ```typescript
 * @Get(':id/pdf')
 * @ResourceOwnership({
 *   resourceType: 'invoice',
 *   paramName: 'id',
 *   ownerField: 'clientId',
 *   userField: 'clientId',
 *   allowRoles: [Role.ADMIN, Role.OPS_MANAGER], // These roles bypass ownership check
 * })
 * async downloadPdf(@Param('id') id: string) { ... }
 * ```
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
import { TenantContextService } from '../services/tenant-context.service';

/**
 * Metadata key for resource ownership configuration
 */
export const RESOURCE_OWNERSHIP_KEY = 'resource_ownership';

/**
 * Configuration for resource ownership check
 */
export interface ResourceOwnershipConfig {
  /** Entity class name (must be registered in TypeORM) */
  resourceType: string;
  /** Route parameter name containing resource ID */
  paramName: string;
  /** Field on the resource that contains owner ID */
  ownerField: string;
  /** Field on the user that should match ownerField (default: 'id') */
  userField?: string;
  /** Roles that bypass ownership check (e.g., admins) */
  allowRoles?: Role[];
  /** Custom error message */
  errorMessage?: string;
}

/**
 * Decorator to mark a route as requiring ownership verification
 */
export const ResourceOwnership = (config: ResourceOwnershipConfig) => SetMetadata(RESOURCE_OWNERSHIP_KEY, config);

interface RequestWithUser extends Request {
  user?: User & { clientId?: string };
}

@Injectable()
export class ResourceOwnershipGuard implements CanActivate {
  private readonly logger = new Logger(ResourceOwnershipGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = this.reflector.get<ResourceOwnershipConfig>(RESOURCE_OWNERSHIP_KEY, context.getHandler());

    // No ownership config = no ownership check required
    if (!config) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Check if user's role bypasses ownership check
    if (config.allowRoles?.includes(user.role)) {
      return true;
    }

    // Get resource ID from route params
    const resourceIdParam = request.params[config.paramName];
    const resourceId = Array.isArray(resourceIdParam) ? resourceIdParam[0] : resourceIdParam;
    if (!resourceId) {
      this.logger.warn(`Missing route param: ${config.paramName}`);
      throw new ForbiddenException('Invalid resource identifier');
    }

    // Verify ownership
    const isOwner = await this.verifyOwnership(user, resourceId, config);
    if (!isOwner) {
      this.logger.warn(
        `Ownership check failed: User ${user.id} attempted to access ${config.resourceType} ${resourceId}`,
      );
      throw new ForbiddenException(config.errorMessage || 'You do not have permission to access this resource');
    }

    return true;
  }

  private async verifyOwnership(
    user: User & { clientId?: string },
    resourceId: string,
    config: ResourceOwnershipConfig,
  ): Promise<boolean> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const userField = config.userField || 'id';

    // Get user's value for comparison
    const userValue = await this.getUserFieldValue(user, userField, tenantId);
    if (!userValue) {
      this.logger.debug(`User ${user.id} has no value for field ${userField}`);
      return false;
    }

    try {
      // Query the resource to check ownership
      const resource = await this.dataSource
        .createQueryBuilder(config.resourceType, 'resource')
        .select(['resource.id', `resource.${config.ownerField}`])
        .where('resource.id = :resourceId', { resourceId })
        .andWhere('resource.tenantId = :tenantId', { tenantId })
        .getOne();

      if (!resource) {
        throw new NotFoundException(`${config.resourceType} ${resourceId} not found`);
      }

      const resourceOwnerValue = (resource as Record<string, unknown>)[config.ownerField];
      return resourceOwnerValue === userValue;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to verify ownership for ${config.resourceType} ${resourceId}: ${error}`);
      // Fail closed - deny access on error
      return false;
    }
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
        return (user as unknown as Record<string, string>)[field] || null;
    }
  }
}
