import 'reflect-metadata';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { Role } from '../users/enums/role.enum';
import { TasksController } from './controllers/tasks.controller';

describe('Tasks authorization policy guardrails', () => {
  const staffAndManagerRoles = [Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF];

  it('enforces explicit roles on critical status transition endpoints', () => {
    const startRoles = Reflect.getMetadata(ROLES_KEY, TasksController.prototype.start) as Role[];
    const completeRoles = Reflect.getMetadata(ROLES_KEY, TasksController.prototype.complete) as Role[];

    expect(startRoles).toEqual(staffAndManagerRoles);
    expect(completeRoles).toEqual(staffAndManagerRoles);
  });

  it('enforces explicit roles on read endpoints accessible to field staff (ARCH-010)', () => {
    const findMyTasksRoles = Reflect.getMetadata(ROLES_KEY, TasksController.prototype.findMyTasks) as Role[];
    const findByBookingRoles = Reflect.getMetadata(ROLES_KEY, TasksController.prototype.findByBooking) as Role[];

    expect(findMyTasksRoles).toEqual(staffAndManagerRoles);
    expect(findByBookingRoles).toEqual(staffAndManagerRoles);
  });
});
