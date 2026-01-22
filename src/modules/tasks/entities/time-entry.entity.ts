import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { User } from '../../users/entities/user.entity';
import { Task } from './task.entity';

export enum TimeEntryStatus {
  RUNNING = 'RUNNING',
  STOPPED = 'STOPPED',
}

@Entity('time_entries')
@Index(['tenantId', 'id'], { unique: true })
@Index(['tenantId', 'taskId'])
@Index(['tenantId', 'userId'])
@Index(['tenantId', 'startTime'])
export class TimeEntry extends BaseTenantEntity {
  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'start_time', type: 'timestamptz' })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamptz', nullable: true })
  endTime: Date | null;

  @Column({
    name: 'duration_minutes',
    type: 'int',
    nullable: true,
  })
  durationMinutes: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({
    type: 'enum',
    enum: TimeEntryStatus,
    default: TimeEntryStatus.RUNNING,
  })
  status: TimeEntryStatus;

  @Column({ default: false })
  billable: boolean;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: Task;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  stop(endTime?: Date): void {
    if (this.status === TimeEntryStatus.RUNNING) {
      this.endTime = endTime || new Date();
      this.durationMinutes = Math.round((this.endTime.getTime() - this.startTime.getTime()) / 60000);
      this.status = TimeEntryStatus.STOPPED;
    }
  }

  getDurationHours(): number {
    if (this.durationMinutes) {
      return this.durationMinutes / 60;
    }
    if (this.endTime) {
      return (this.endTime.getTime() - this.startTime.getTime()) / 3600000;
    }
    return (new Date().getTime() - this.startTime.getTime()) / 3600000;
  }
}
