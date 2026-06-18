import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { User } from '../../modules/users/entities/user.entity';
import { AbilityFactory, type AppAction, type AppSubject } from '../authorization/ability.factory';

export const CHECK_ABILITY_KEY = 'check_ability';

export interface CheckAbilityMeta {
  action: AppAction;
  subject: AppSubject;
}

export const CheckAbility = (action: AppAction, subject: AppSubject) =>
  SetMetadata(CHECK_ABILITY_KEY, { action, subject } satisfies CheckAbilityMeta);

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
    const meta = this.reflector.get<CheckAbilityMeta>(CHECK_ABILITY_KEY, context.getHandler());
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
