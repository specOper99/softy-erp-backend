import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { Role } from '../../modules/users/enums/role.enum';

/**
 * Stable list of resources we plan to express authorization rules for.
 * Extending this list does not need a code change in callers — services
 * pass the subject string into `ability.can(action, subject)`.
 *
 * Keep aligned with the resources already enforced by the legacy
 * `RolesGuard` and `ResourceOwnershipGuard`.
 */
export type AppSubject = 'all' | 'Booking' | 'Client' | 'Invoice' | 'Payroll' | 'Task' | 'User' | 'Webhook';

export type AppAction = 'manage' | 'create' | 'read' | 'update' | 'delete';

export type AppAbility = MongoAbility<[AppAction, AppSubject]>;

export interface AbilitySubject {
  id: string;
  role: Role;
  tenantId: string;
}

/**
 * Build a CASL `AppAbility` from a user.
 *
 * Phase 0: rules mirror the role-based decisions already enforced by
 * `RolesGuard`. Resource-level ownership (currently in
 * `ResourceOwnershipGuard`) will be expressed as MongoDB-style match
 * conditions here in a follow-up PR — at which point both guards can be
 * deleted.
 */
@Injectable()
export class AbilityFactory {
  build(user: AbilitySubject): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    switch (user.role) {
      case Role.ADMIN:
        can('manage', 'all');
        break;
      case Role.OPS_MANAGER:
        can('manage', 'Booking');
        can('manage', 'Client');
        can('manage', 'Task');
        can('read', 'Invoice');
        can('read', 'Payroll');
        can('read', 'User');
        break;
      case Role.FIELD_STAFF:
        can('read', 'Task');
        can('update', 'Task');
        can('read', 'Booking');
        break;
      case Role.CLIENT:
        can('read', 'Booking');
        can('read', 'Invoice');
        break;
    }

    return build();
  }
}
