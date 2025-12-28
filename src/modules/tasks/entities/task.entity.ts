import {
  Column,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { TaskStatus } from '../../../common/enums';
import { Booking } from '../../bookings/entities/booking.entity';
import { TaskType } from '../../catalog/entities/task-type.entity';
import { User } from '../../users/entities/user.entity';

import { BaseTenantEntity } from '../../../common/entities/abstract.entity';

@Entity('tasks')
export class Task extends BaseTenantEntity {
  @Column({ name: 'booking_id' })
  bookingId: string;

  @Column({ name: 'task_type_id' })
  taskTypeId: string;

  @Column({ name: 'assigned_user_id', nullable: true })
  assignedUserId: string | null;

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

  @ManyToOne(() => Booking, (booking) => booking.tasks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking: Booking;

  @ManyToOne(() => TaskType, (taskType) => taskType.tasks)
  @JoinColumn({ name: 'task_type_id' })
  taskType: TaskType;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_user_id' })
  assignedUser: User | null;
}
