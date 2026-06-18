import { AbilityBuilder, createMongoAbility, subject, type MongoAbility } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { Role } from '../../modules/users/enums/role.enum';

export type AppSubject = 'all' | 'Booking' | 'Client' | 'Invoice' | 'Payroll' | 'Task' | 'User' | 'Webhook';

export type AppAction = 'manage' | 'create' | 'read' | 'update' | 'delete';

export type AppAbility = MongoAbility<[AppAction, AppSubject | Record<string, unknown>]>;

export interface AbilitySubject {
  id: string;
  role: Role;
  tenantId: string;
  clientId?: string;
}

const ENTITY_TO_SUBJECT: Record<string, AppSubject> = {
  Booking: 'Booking',
  Client: 'Client',
  Invoice: 'Invoice',
  Payroll: 'Payroll',
  Task: 'Task',
  User: 'User',
  Webhook: 'Webhook',
};

@Injectable()
export class AbilityFactory {
  /** Maps TypeORM entity names used by ResourceOwnershipGuard to CASL subjects. */
  mapResourceType(resourceType: string): AppSubject | null {
    return ENTITY_TO_SUBJECT[resourceType] ?? null;
  }

  build(user: AbilitySubject): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
    const { tenantId } = user;

    switch (user.role) {
      case Role.ADMIN:
        can('manage', 'all');
        break;
      case Role.OPS_MANAGER:
        can('manage', 'Booking', { tenantId });
        can('manage', 'Client', { tenantId });
        can('manage', 'Task', { tenantId });
        can('read', 'Invoice', { tenantId });
        can('read', 'Payroll', { tenantId });
        can('read', 'User', { tenantId });
        break;
      case Role.FIELD_STAFF:
        can('read', 'Task', { assignedUserId: user.id, tenantId });
        can('update', 'Task', { assignedUserId: user.id, tenantId });
        can('read', 'Booking', { tenantId });
        break;
      case Role.CLIENT: {
        const clientConditions = user.clientId ? { clientId: user.clientId, tenantId } : { tenantId };
        can('read', 'Booking', clientConditions);
        can('read', 'Invoice', clientConditions);
        break;
      }
    }

    return build();
  }

  canReadResource(ability: AppAbility, resourceType: AppSubject, instance: Record<string, unknown>): boolean {
    return ability.can('read', subject(resourceType, instance));
  }
}
