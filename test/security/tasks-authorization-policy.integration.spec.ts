import 'reflect-metadata';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { TasksController } from '../../src/modules/tasks/controllers/tasks.controller';
import { Role } from '../../src/modules/users/enums/role.enum';

describe('Tasks authorization policy guardrail (integration config)', () => {
  const staffAndManagerRoles = [Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF];

  it('keeps explicit roles on critical mutation endpoints', () => {
    const startRoles = Reflect.getMetadata(ROLES_KEY, TasksController.prototype.start) as Role[];
    const completeRoles = Reflect.getMetadata(ROLES_KEY, TasksController.prototype.complete) as Role[];

    expect(startRoles).toEqual(staffAndManagerRoles);
    expect(completeRoles).toEqual(staffAndManagerRoles);
  });

  it('keeps explicit roles on read endpoints accessible to field staff (ARCH-010)', () => {
    const findMyTasksRoles = Reflect.getMetadata(ROLES_KEY, TasksController.prototype.findMyTasks) as Role[];
    const findByBookingRoles = Reflect.getMetadata(ROLES_KEY, TasksController.prototype.findByBooking) as Role[];

    expect(findMyTasksRoles).toEqual(staffAndManagerRoles);
    expect(findByBookingRoles).toEqual(staffAndManagerRoles);
  });
});
