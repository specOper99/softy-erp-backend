import 'reflect-metadata';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { Role } from '../users/enums/role.enum';
import { TasksController } from './controllers/tasks.controller';

describe('Tasks authorization policy guardrails', () => {
  it('enforces explicit roles on critical status transition endpoints', () => {
    const startRoles = Reflect.getMetadata(ROLES_KEY, TasksController.prototype.start) as Role[];
    const completeRoles = Reflect.getMetadata(ROLES_KEY, TasksController.prototype.complete) as Role[];

    expect(startRoles).toEqual([Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF]);
    expect(completeRoles).toEqual([Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF]);
  });
});
