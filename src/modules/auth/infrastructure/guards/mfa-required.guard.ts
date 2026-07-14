import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Role } from '../../../users/domain/enums/role.enum';

interface AuthenticatedUser {
  id: string;
  role: Role;
  isMfaEnabled: boolean;
}

export const MFA_REQUIRED_KEY = 'mfa_required';

@Injectable()
export class MfaRequiredGuard implements CanActivate {
  private readonly requiredRoles: Role[];

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    this.requiredRoles = this.configService
      .get<string>('MFA_REQUIRED_ROLES', 'ADMIN')
      .split(',')
      .map((r) => r.trim() as Role);
  }

  canActivate(context: ExecutionContext): boolean {
    const isMfaRequired = this.reflector.getAllAndOverride<boolean>(MFA_REQUIRED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isMfaRequired) return true;

    const user = (context.switchToHttp().getRequest<Request>() as Request & { user?: AuthenticatedUser }).user;
    if (!user) throw new ForbiddenException('common.authentication_required');

    if (this.requiredRoles.includes(user.role) && !user.isMfaEnabled) {
      throw new ForbiddenException({ code: 'auth.mfa_required_enable' });
    }
    return true;
  }
}
