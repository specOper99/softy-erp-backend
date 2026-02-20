import { ForbiddenException } from '@nestjs/common';
import { Role } from '../../modules/users/enums/role.enum';

export interface UserScopePrincipal {
  id: string;
  role: Role;
}

export function resolveRequestedUserIdScope(user: UserScopePrincipal, requestedUserId?: string): string | undefined {
  if (user.role !== Role.FIELD_STAFF) {
    return requestedUserId;
  }

  if (!requestedUserId) {
    return user.id;
  }

  if (requestedUserId !== user.id) {
    throw new ForbiddenException('Field staff can only access their own records');
  }

  return requestedUserId;
}
