import 'reflect-metadata';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { TasksController } from '../../src/modules/tasks/controllers/tasks.controller';
import { Role } from '../../src/modules/users/enums/role.enum';

describe('Tasks authorization policy guardrail (integration config)', () => {
  it('keeps explicit roles on critical mutation endpoints', () => {
    const startRoles = Reflect.getMetadata(ROLES_KEY, TasksController.prototype.start) as Role[];
    const completeRoles = Reflect.getMetadata(ROLES_KEY, TasksController.prototype.complete) as Role[];

    expect(startRoles).toEqual([Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF]);
    expect(completeRoles).toEqual([Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF]);
  });
});
