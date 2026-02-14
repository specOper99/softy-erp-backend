import { Column, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { TaskStatus } from '../enums/task-status.enum';

import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import type { Booking } from '../../bookings/entities/booking.entity';
import type { TaskType } from '../../catalog/entities/task-type.entity';
import type { User } from '../../users/entities/user.entity';

@Entity('tasks')
@Index(['tenantId', 'status', 'dueDate'])
@Index(['tenantId', 'deletedAt'])
@Index(['tenantId', 'createdAt']) // Optimize default pagination
export class Task extends BaseTenantEntity {
  @Index()
  @Column({ name: 'booking_id' })
  bookingId: string;

  @Index()
  @Column({ name: 'task_type_id' })
  taskTypeId: string;

  @Index()
  @Column({ name: 'assigned_user_id', nullable: true })
  assignedUserId: string | null;

  @Index()
  @Column({ name: 'parent_id', nullable: true })
  parentId: string | null;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.PENDING,
  })
  status: TaskStatus;

  @Column({
    name: 'commission_snapshot',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  commissionSnapshot: number;

  @Column({ name: 'due_date', type: 'timestamptz', nullable: true })
  dueDate: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date;

  @ManyToOne('Booking', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'booking_id' })
  booking: Booking;

  @ManyToOne('TaskType')
  @JoinColumn({ name: 'task_type_id' })
  taskType: TaskType;

  @ManyToOne('User', { nullable: true })
  @JoinColumn({ name: 'assigned_user_id' })
  assignedUser: Promise<User | null>;

  @ManyToOne('Task', (task: Task) => task.subTasks, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: Task | null;

  @OneToMany('Task', (task: Task) => task.parent)
  subTasks: Promise<Task[]>;
}
