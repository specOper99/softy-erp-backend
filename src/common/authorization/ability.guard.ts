import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { User } from '../../modules/users/entities/user.entity';
import { AbilityFactory } from '../authorization/ability.factory';
import { CHECK_ABILITY_KEY, type CheckAbilityMetadata } from './check-ability.decorator';

export { CheckAbility, CHECK_ABILITY_KEY } from './check-ability.decorator';
export type { CheckAbilityMetadata as CheckAbilityMeta } from './check-ability.decorator';

interface RequestWithUser extends Request {
  user?: User & { clientId?: string };
}

/**
 * CASL-backed guard for future cutover. Not registered globally in shadow mode.
 */
@Injectable()
export class AbilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const meta = this.reflector.get<CheckAbilityMetadata>(CHECK_ABILITY_KEY, context.getHandler());
    if (!meta) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('common.authentication_required');
    }

    const ability = this.abilityFactory.build({
      id: user.id,
      role: user.role,
      tenantId: user.tenantId,
      clientId: user.clientId,
    });

    if (!ability.can(meta.action, meta.subject)) {
      throw new ForbiddenException('common.forbidden');
    }

    return true;
  }
}
