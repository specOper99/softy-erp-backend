import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Role } from '../../users/enums/role.enum';

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
    const rolesString = this.configService.get<string>(
      'MFA_REQUIRED_ROLES',
      'ADMIN',
    );
    this.requiredRoles = rolesString.split(',').map((r) => r.trim() as Role);
  }

  canActivate(context: ExecutionContext): boolean {
    const isMfaRequired = this.reflector.getAllAndOverride<boolean>(
      MFA_REQUIRED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!isMfaRequired) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as Request & { user?: AuthenticatedUser }).user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (this.requiredRoles.includes(user.role)) {
      if (!user.isMfaEnabled) {
        throw new ForbiddenException(
          'MFA is required for this action. Please enable MFA in your account settings.',
        );
      }
    }

    return true;
  }
}
