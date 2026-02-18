import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { User } from '../../users/entities/user.entity';
import { TaskAssigneeRole } from '../enums/task-assignee-role.enum';
import { Task } from './task.entity';

@Entity('task_assignees')
@Index(['tenantId', 'id'], { unique: true })
@Index(['tenantId', 'taskId', 'userId'], { unique: true })
@Index(['tenantId', 'taskId'])
@Index(['tenantId', 'userId'])
export class TaskAssignee extends BaseTenantEntity {
  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: TaskAssigneeRole,
    default: TaskAssigneeRole.ASSISTANT,
  })
  role: TaskAssigneeRole;

  @Column({
    name: 'commission_snapshot',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  commissionSnapshot: number;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: Task;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
